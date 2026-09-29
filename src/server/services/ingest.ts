import "server-only";
import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import type { Extraction } from "@/integrations/ai";
import { pdfText } from "@/integrations/ai";
import { DemoProvider } from "@/integrations/ai/demo";
import { isUbl, parseUbl } from "@/integrations/einvoice/ubl";
import { normalizeAccount, normalizeIban, normalizeReg, parseFik, danishIbanToBban } from "@/lib/banking";
import { parseAmount } from "@/lib/utils";
import { storeFile, guessMime } from "./files";
import { resolveSupplier } from "./suppliers";
import { autoCode } from "./coding";
import { runChecks, blockingFlags } from "./checks";
import { aiFor } from "./integrations";
import { audit } from "../audit";

export type IngestInput = {
  companyId: string;
  userId: string | null;
  file: { name: string; mime?: string | null; data: Buffer };
  source: "upload" | "email" | "nemhandel" | "mobile" | "boligflow" | "demo";
  sourceRef?: string | null;
  kind?: "invoice" | "expense";
  /** Kør ikke automatisk videre til godkendelse (fx i tests) */
  noAutoSubmit?: boolean;
};

/** Modtager et dokument, gemmer det og starter AI-aflæsning. Returnerer fakturaens id. */
export async function ingestDocument(db: DB, input: IngestInput) {
  const mime = guessMime(input.file.name, input.file.mime);
  const stored = await storeFile(db, input.companyId, { name: input.file.name, mime, data: input.file.data });
  const [inv] = await db
    .insert(schema.invoices)
    .values({
      companyId: input.companyId,
      fileId: stored.id,
      source: input.source,
      sourceRef: input.sourceRef ?? null,
      kind: input.kind ?? "invoice",
      status: "processing",
      submittedBy: input.userId,
      expenseUserId: input.kind === "expense" ? input.userId : null,
    })
    .returning({ id: schema.invoices.id });
  await audit(db, input.companyId, input.userId, "invoice", inv!.id, "received", { source: input.source, file: input.file.name });
  await processInvoice(db, inv!.id, { fileDuplicateOf: stored.duplicateFileId, noAutoSubmit: input.noAutoSubmit });
  return inv!.id;
}

/** Aflæser (eller genaflæser) et dokument og kører kontering, kontroller og automatisk routing. */
export async function processInvoice(db: DB, invoiceId: string, opts?: { fileDuplicateOf?: string | null; noAutoSubmit?: boolean }) {
  const invoice = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, invoiceId) });
  if (!invoice?.fileId) return;
  const file = await db.query.files.findFirst({ where: eq(schema.files.id, invoice.fileId) });
  if (!file) return;
  const company = await db.query.companies.findFirst({ where: eq(schema.companies.id, invoice.companyId) });

  const started = Date.now();
  let extraction: Extraction;
  let provider: "claude" | "demo" | "ubl" = "demo";
  let model: string | undefined;
  let rawText: string | null = null;

  const asText = file.mime.includes("xml") ? file.data.toString("utf8") : null;
  try {
    if (asText && isUbl(asText)) {
      extraction = parseUbl(asText);
      provider = "ubl";
    } else {
      rawText = file.mime === "application/pdf" ? await pdfText(file.data) : asText;
      const { ai } = await aiFor(db, invoice.companyId);
      try {
        extraction = await ai.extract({
          bytes: file.data,
          mime: file.mime,
          fileName: file.name,
          text: rawText,
          companyName: company?.name,
          companyCvr: company?.cvr,
        });
        provider = ai.name;
        model = ai.model;
      } catch (e) {
        // Fald tilbage til demo-motoren hvis Claude fejler (netværk, kvote)
        extraction = await new DemoProvider().extract({ bytes: file.data, mime: file.mime, fileName: file.name, text: rawText, companyCvr: company?.cvr });
        provider = "demo";
        extraction.summary = `${extraction.summary} (AI-fejl: ${(e as Error).message.slice(0, 80)})`;
      }
    }
  } catch (e) {
    await db
      .update(schema.invoices)
      .set({
        status: "review",
        flags: [{ code: "low_confidence", severity: "warning", message: `Dokumentet kunne ikke læses: ${(e as Error).message}` }],
      })
      .where(eq(schema.invoices.id, invoiceId));
    return;
  }

  await applyExtraction(db, invoiceId, extraction, {
    provider,
    model,
    rawText: rawText?.slice(0, 20000) ?? undefined,
    durationMs: Date.now() - started,
  });

  await autoCode(db, invoiceId, { force: true, documentText: rawText, deliveryAddress: extraction.deliveryAddress });

  const fresh = (await db.query.invoices.findFirst({ where: eq(schema.invoices.id, invoiceId) }))!;
  const flags = await runChecks(db, fresh, { fileDuplicateOf: opts?.fileDuplicateOf });
  await db.update(schema.invoices).set({ flags, status: "review" }).where(eq(schema.invoices.id, invoiceId));

  if (!opts?.noAutoSubmit) await maybeAutoSubmit(db, invoiceId);
}

/** Straight-through: kendt leverandør, sikre felter, fuld kontering og ingen advarsler → direkte til godkendelse. */
async function maybeAutoSubmit(db: DB, invoiceId: string) {
  const inv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, invoiceId) });
  if (!inv || inv.status !== "review") return;
  if (blockingFlags(inv.flags).length) return;
  const lines = await db.select().from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, invoiceId));
  const coded = lines.length > 0 && lines.every((l) => l.accountNumber && (l.aiConfidence ?? 1) >= 0.8);
  const conf = inv.extraction?.confidence ?? {};
  const confident = Object.values(conf).every((v) => (v ?? 0) >= 0.75);
  const known = inv.flags.every((f) => f.code !== "new_supplier");
  if ((coded && confident && known && inv.totalAmount) || (inv.kind === "expense" && inv.totalAmount && coded)) {
    const { submitForApproval } = await import("./approvals");
    await submitForApproval(db, invoiceId, null, { auto: true });
  }
}

const toOre = (n: number | null | undefined) => (n == null ? null : Math.round(n * 100));

export async function applyExtraction(
  db: DB,
  invoiceId: string,
  x: Extraction,
  meta: { provider: "claude" | "demo" | "ubl"; model?: string; rawText?: string; durationMs?: number },
) {
  const invoice = (await db.query.invoices.findFirst({ where: eq(schema.invoices.id, invoiceId) }))!;
  const fik = x.fikLine ? parseFik(x.fikLine) : null;
  let bankReg = normalizeReg(x.bankReg);
  let bankAccount = normalizeAccount(x.bankAccount);
  const iban = normalizeIban(x.iban);
  if (!bankReg && iban?.startsWith("DK")) {
    const b = danishIbanToBban(iban);
    bankReg = b?.reg ?? null;
    bankAccount = b?.account ?? null;
  }
  let paymentMethod: string | null =
    x.paymentMethod === "fik" && fik
      ? "fik"
      : x.paymentMethod === "betalingsservice"
        ? "betalingsservice"
        : x.paymentMethod === "card" || x.paymentMethod === "paid"
          ? "card"
          : bankReg && bankAccount
            ? "domestic"
            : iban
              ? "iban"
              : fik
                ? "fik"
                : null;
  if (invoice.kind === "expense") paymentMethod = "expense";

  const { supplier } = await resolveSupplier(db, invoice.companyId, {
    name: x.supplierName,
    cvr: x.supplierCvr,
    email: x.supplierEmail,
    address: x.supplierAddress,
    bankReg,
    bankAccount,
    iban,
    bic: x.bic,
    fikCreditor: fik?.creditor ?? null,
  });

  let total = toOre(x.totalAmount);
  let exVat = toOre(x.amountExVat);
  let vat = toOre(x.vatAmount);
  if (total != null && exVat == null && vat != null) exVat = total - vat;
  if (total != null && vat == null && exVat != null) vat = total - exVat;
  if (total == null && exVat != null && vat != null) total = exVat + vat;

  let dueDate = x.dueDate;
  if (!dueDate && x.issueDate && supplier?.paymentTermsDays) {
    const d = new Date(x.issueDate + "T12:00:00");
    d.setDate(d.getDate() + supplier.paymentTermsDays);
    dueDate = d.toISOString().slice(0, 10);
  }

  const kind = invoice.kind === "expense" ? "expense" : x.documentType === "credit_note" ? "credit_note" : "invoice";

  await db
    .update(schema.invoices)
    .set({
      kind,
      supplierId: supplier?.id ?? null,
      supplierName: supplier?.name ?? x.supplierName,
      supplierCvr: x.supplierCvr,
      invoiceNumber: x.invoiceNumber,
      issueDate: x.issueDate,
      dueDate,
      currency: (x.currency || "DKK").toUpperCase().slice(0, 3),
      amountExVat: exVat != null ? Math.abs(exVat) : null,
      vatAmount: vat != null ? Math.abs(vat) : null,
      totalAmount: total != null ? Math.abs(total) : null,
      paymentMethod,
      fikType: fik?.type ?? null,
      fikCreditor: fik?.creditor ?? null,
      fikPaymentId: fik?.paymentId ?? null,
      bankReg,
      bankAccount,
      iban,
      bic: x.bic,
      paymentMessage: x.paymentReference ?? (x.invoiceNumber ? `Faktura ${x.invoiceNumber}` : null),
      discountDate: x.discountDate,
      discountAmount: toOre(x.discountAmount),
      description: x.summary,
      extraction: {
        provider: meta.provider,
        model: meta.model,
        confidence: x.confidence,
        rawText: meta.rawText,
        summary: x.summary,
        durationMs: meta.durationMs,
      },
    })
    .where(eq(schema.invoices.id, invoiceId));

  await db.delete(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, invoiceId));
  const lines = x.lines.length
    ? x.lines
    : total != null
      ? [{ description: x.summary || "Faktura", quantity: 1, unitPrice: null, amount: (exVat ?? total) / 100, vatRate: 0.25 }]
      : [];
  if (lines.length) {
    const vatCodes = await db.select().from(schema.vatCodes).where(eq(schema.vatCodes.companyId, invoice.companyId));
    const vatFor = (rate: number | null) => {
      if (rate == null) return null;
      return vatCodes.find((v) => Math.abs(v.rate - rate) < 0.001 && v.code.startsWith("I"))?.code ?? vatCodes.find((v) => Math.abs(v.rate - rate) < 0.001)?.code ?? null;
    };
    await db.insert(schema.invoiceLines).values(
      lines.map((l, i) => ({
        invoiceId,
        position: i,
        description: l.description.slice(0, 500),
        quantity: l.quantity ?? 1,
        unitPrice: l.unitPrice != null ? Math.round(l.unitPrice * 100) : null,
        amount: Math.abs(Math.round(l.amount * 100)),
        vatCode: vatFor(l.vatRate),
      })),
    );
  }
}

/** Manuel ændring af beløb fra formular ("1.234,50") */
export function amountFromForm(v: FormDataEntryValue | null) {
  return typeof v === "string" ? parseAmount(v) : null;
}
