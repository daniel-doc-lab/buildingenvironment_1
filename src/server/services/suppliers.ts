import "server-only";
import { and, eq, ilike, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import { lookupCvr } from "@/integrations/cvr";
import { normalizeCvr, normalizeIban, paymentFingerprint } from "@/lib/banking";

type SupplierHint = {
  name: string | null;
  cvr: string | null;
  email?: string | null;
  address?: string | null;
  bankReg?: string | null;
  bankAccount?: string | null;
  iban?: string | null;
  bic?: string | null;
  fikCreditor?: string | null;
};

function normName(s: string) {
  return s
    .toLowerCase()
    .replace(/\b(a\/s|aps|i\/s|ivs|p\/s|k\/s|as|a\.s\.)\b/g, "")
    .replace(/[^a-z0-9æøå]+/g, " ")
    .trim();
}

/** Finder eksisterende leverandør (CVR → navn) eller opretter en ny beriget med CVR-data. */
export async function resolveSupplier(db: DB, companyId: string, hint: SupplierHint) {
  const cvr = normalizeCvr(hint.cvr);
  if (cvr) {
    const byCvr = await db.query.suppliers.findFirst({
      where: and(eq(schema.suppliers.companyId, companyId), eq(schema.suppliers.cvr, cvr)),
    });
    if (byCvr) return { supplier: byCvr, created: false };
  }
  if (hint.name) {
    const candidates = await db
      .select()
      .from(schema.suppliers)
      .where(and(eq(schema.suppliers.companyId, companyId), ilike(schema.suppliers.name, `%${hint.name.split(/\s+/)[0]}%`)));
    const target = normName(hint.name);
    const match = candidates.find((c) => normName(c.name) === target);
    if (match) {
      if (cvr && !match.cvr) await db.update(schema.suppliers).set({ cvr }).where(eq(schema.suppliers.id, match.id));
      return { supplier: match, created: false };
    }
  }
  if (!hint.name && !cvr) return { supplier: null, created: false };

  const info = cvr ? await lookupCvr(cvr) : null;
  const [created] = await db
    .insert(schema.suppliers)
    .values({
      companyId,
      name: info?.name ?? hint.name ?? `CVR ${cvr}`,
      cvr,
      address: info ? [info.address, [info.zip, info.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") : hint.address ?? null,
      email: hint.email ?? info?.email ?? null,
      phone: info?.phone ?? null,
      industry: info?.industry ?? null,
      bankReg: hint.bankReg ?? null,
      bankAccount: hint.bankAccount ?? null,
      iban: normalizeIban(hint.iban),
      bic: hint.bic ?? null,
      fiCreditor: hint.fikCreditor ?? null,
    })
    .returning();
  return { supplier: created!, created: true };
}

/** Opdaterer leverandørens kendte betalingsoplysninger efter godkendelse. */
export async function rememberPaymentDetails(
  db: DB,
  supplierId: string,
  inv: { bankReg: string | null; bankAccount: string | null; iban: string | null; bic: string | null; fikCreditor: string | null; fikType: string | null },
) {
  const s = await db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, supplierId) });
  if (!s) return;
  const before = paymentFingerprint({ fikCreditor: s.fiCreditor, bankReg: s.bankReg, bankAccount: s.bankAccount, iban: s.iban });
  const after = paymentFingerprint(inv);
  if (!after || before === after) return;
  const patch: Partial<typeof schema.suppliers.$inferInsert> = {};
  if (inv.iban) patch.iban = inv.iban;
  if (inv.bic) patch.bic = inv.bic;
  if (inv.bankReg && inv.bankAccount) {
    patch.bankReg = inv.bankReg;
    patch.bankAccount = inv.bankAccount;
  }
  if (inv.fikCreditor) patch.fiCreditor = inv.fikCreditor;
  if (before) patch.bankChangedAt = new Date();
  await db.update(schema.suppliers).set(patch).where(eq(schema.suppliers.id, supplierId));
}

export async function supplierStats(db: DB, companyId: string) {
  return db
    .select({
      supplierId: schema.invoices.supplierId,
      count: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${schema.invoices.totalAmount}),0)::bigint`,
      last: sql<string>`max(${schema.invoices.issueDate})`,
    })
    .from(schema.invoices)
    .where(eq(schema.invoices.companyId, companyId))
    .groupBy(schema.invoices.supplierId);
}
