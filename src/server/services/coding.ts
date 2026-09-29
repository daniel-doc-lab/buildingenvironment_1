import "server-only";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import type { CodingContext } from "@/integrations/ai";
import { matchProperty } from "@/integrations/ai/demo";
import { aiFor } from "./integrations";

export async function codingContext(db: DB, companyId: string, supplierId: string | null): Promise<CodingContext> {
  const [accounts, vatCodes, properties, departments, supplier] = await Promise.all([
    db
      .select({ number: schema.accounts.number, name: schema.accounts.name, defaultVatCode: schema.accounts.defaultVatCode })
      .from(schema.accounts)
      .where(and(eq(schema.accounts.companyId, companyId), eq(schema.accounts.type, "expense"), eq(schema.accounts.active, true))),
    db.select({ code: schema.vatCodes.code, name: schema.vatCodes.name, rate: schema.vatCodes.rate }).from(schema.vatCodes).where(eq(schema.vatCodes.companyId, companyId)),
    db.select({ id: schema.properties.id, name: schema.properties.name, address: schema.properties.address }).from(schema.properties).where(eq(schema.properties.companyId, companyId)),
    db.select({ code: schema.departments.code, name: schema.departments.name }).from(schema.departments).where(eq(schema.departments.companyId, companyId)),
    supplierId ? db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, supplierId) }) : Promise.resolve(undefined),
  ]);
  const history = supplierId
    ? await db
        .select({
          description: schema.invoiceLines.description,
          accountNumber: schema.invoiceLines.accountNumber,
          vatCode: schema.invoiceLines.vatCode,
          propertyId: schema.invoiceLines.propertyId,
        })
        .from(schema.invoiceLines)
        .innerJoin(schema.invoices, eq(schema.invoices.id, schema.invoiceLines.invoiceId))
        .where(and(eq(schema.invoices.supplierId, supplierId), inArray(schema.invoices.status, ["approved", "scheduled", "paid", "archived"])))
        .orderBy(desc(schema.invoices.issueDate))
        .limit(40)
    : [];
  return {
    accounts,
    vatCodes,
    properties,
    departments,
    supplierName: supplier?.name ?? null,
    supplierIndustry: supplier?.industry ?? null,
    history,
  };
}

/**
 * Konterer fakturaens linjer: 1) faste regler, 2) leverandørens standardkontering, 3) AI (historik/nøgleord/Claude).
 * Overskriver kun linjer uden konto, medmindre force=true.
 */
export async function autoCode(db: DB, invoiceId: string, opts?: { force?: boolean; documentText?: string | null; deliveryAddress?: string | null }) {
  const invoice = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, invoiceId) });
  if (!invoice) return;
  const lines = await db.select().from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, invoiceId)).orderBy(schema.invoiceLines.position);
  const todo = lines.filter((l) => opts?.force || !l.accountNumber);
  if (!todo.length) return;

  const ctx = await codingContext(db, invoice.companyId, invoice.supplierId);
  ctx.documentText = opts?.documentText ?? invoice.extraction?.rawText ?? null;
  ctx.deliveryAddress = opts?.deliveryAddress ?? null;
  const supplier = invoice.supplierId ? await db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, invoice.supplierId) }) : null;
  const rules = await db
    .select()
    .from(schema.codingRules)
    .where(
      and(
        eq(schema.codingRules.companyId, invoice.companyId),
        eq(schema.codingRules.active, true),
        invoice.supplierId ? or(eq(schema.codingRules.supplierId, invoice.supplierId), isNull(schema.codingRules.supplierId)) : isNull(schema.codingRules.supplierId),
      ),
    );

  const propertyGuess = invoice.propertyId ?? matchProperty(ctx) ?? supplier?.defaultPropertyId ?? null;
  const needAi: typeof todo = [];
  const updates = new Map<string, Partial<typeof schema.invoiceLines.$inferInsert>>();

  for (const line of todo) {
    const rule =
      rules.find((r) => r.supplierId && r.matchText && line.description.toLowerCase().includes(r.matchText.toLowerCase())) ??
      rules.find((r) => !r.supplierId && r.matchText && line.description.toLowerCase().includes(r.matchText.toLowerCase())) ??
      rules.find((r) => r.supplierId && !r.matchText);
    if (rule?.accountNumber) {
      updates.set(line.id, {
        accountNumber: rule.accountNumber,
        vatCode: rule.vatCode ?? ctx.accounts.find((a) => a.number === rule.accountNumber)?.defaultVatCode ?? null,
        departmentCode: rule.departmentCode ?? line.departmentCode,
        propertyId: rule.propertyId ?? propertyGuess ?? line.propertyId,
        aiSuggested: true,
        aiConfidence: 0.99,
        aiReason: `Regel: ${rule.name}`,
      });
      await db.update(schema.codingRules).set({ hits: rule.hits + 1 }).where(eq(schema.codingRules.id, rule.id));
      continue;
    }
    if (supplier?.defaultAccount && ctx.history.length === 0) {
      updates.set(line.id, {
        accountNumber: supplier.defaultAccount,
        vatCode: supplier.defaultVatCode ?? ctx.accounts.find((a) => a.number === supplier.defaultAccount)?.defaultVatCode ?? null,
        departmentCode: supplier.defaultDepartment ?? line.departmentCode,
        propertyId: propertyGuess ?? line.propertyId,
        aiSuggested: true,
        aiConfidence: 0.9,
        aiReason: "Leverandørens standardkontering",
      });
      continue;
    }
    needAi.push(line);
  }

  if (needAi.length) {
    const { ai } = await aiFor(db, invoice.companyId);
    let suggestions;
    try {
      suggestions = await ai.suggestCoding(
        needAi.map((l) => ({ description: l.description, amount: l.amount })),
        ctx,
      );
    } catch {
      const { DemoProvider } = await import("@/integrations/ai/demo");
      suggestions = await new DemoProvider().suggestCoding(
        needAi.map((l) => ({ description: l.description, amount: l.amount })),
        ctx,
      );
    }
    needAi.forEach((line, i) => {
      const s = suggestions[i];
      if (!s || !s.accountNumber) return;
      updates.set(line.id, {
        accountNumber: s.accountNumber,
        vatCode: s.vatCode ?? line.vatCode,
        departmentCode: s.departmentCode ?? line.departmentCode,
        propertyId: s.propertyId ?? propertyGuess ?? line.propertyId,
        aiSuggested: true,
        aiConfidence: s.confidence,
        aiReason: s.reason,
      });
    });
  }

  for (const [id, patch] of updates) {
    await db.update(schema.invoiceLines).set(patch).where(eq(schema.invoiceLines.id, id));
  }
  if (propertyGuess && !invoice.propertyId) {
    await db.update(schema.invoices).set({ propertyId: propertyGuess }).where(eq(schema.invoices.id, invoiceId));
  }
}

/** Lærer af godkendt kontering: opretter/forstærker en leverandørregel når alle linjer bruger samme konto. */
export async function learnFromInvoice(db: DB, invoiceId: string) {
  const invoice = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, invoiceId) });
  if (!invoice?.supplierId) return;
  const lines = await db.select().from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, invoiceId));
  const accounts = new Set(lines.map((l) => l.accountNumber).filter(Boolean));
  if (accounts.size !== 1) return;
  const account = [...accounts][0]!;
  const vat = lines[0]?.vatCode ?? null;
  const existing = await db.query.codingRules.findFirst({
    where: and(
      eq(schema.codingRules.companyId, invoice.companyId),
      eq(schema.codingRules.supplierId, invoice.supplierId),
      isNull(schema.codingRules.matchText),
    ),
  });
  // Kræver mindst 2 ens godkendelser før en lært regel oprettes
  const history = await db
    .select({ account: schema.invoiceLines.accountNumber })
    .from(schema.invoiceLines)
    .innerJoin(schema.invoices, eq(schema.invoices.id, schema.invoiceLines.invoiceId))
    .where(and(eq(schema.invoices.supplierId, invoice.supplierId), inArray(schema.invoices.status, ["approved", "scheduled", "paid", "archived"])))
    .limit(20);
  const same = history.filter((h) => h.account === account).length;
  if (existing) {
    if (existing.source === "learned" && existing.accountNumber !== account && same >= 2) {
      await db.update(schema.codingRules).set({ accountNumber: account, vatCode: vat }).where(eq(schema.codingRules.id, existing.id));
    }
    return;
  }
  if (same >= 2) {
    const supplier = await db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, invoice.supplierId) });
    await db.insert(schema.codingRules).values({
      companyId: invoice.companyId,
      name: `${supplier?.name ?? "Leverandør"} → ${account}`,
      supplierId: invoice.supplierId,
      accountNumber: account,
      vatCode: vat,
      propertyId: null,
      source: "learned",
    });
  }
}
