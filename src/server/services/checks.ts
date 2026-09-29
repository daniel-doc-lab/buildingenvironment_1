import "server-only";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import type { InvoiceFlag } from "@/db/schema";
import { paymentFingerprint } from "@/lib/banking";
import { daysBetween, formatMoney, todayISO } from "@/lib/utils";

type Invoice = typeof schema.invoices.$inferSelect;

/**
 * Kontroller der fanger fejl og svindel før betaling:
 * dubletter, ændrede kontonumre, prisudsving, momsfejl, manglende betalingsoplysninger m.m.
 */
export async function runChecks(db: DB, invoice: Invoice, opts?: { fileDuplicateOf?: string | null }): Promise<InvoiceFlag[]> {
  const flags: InvoiceFlag[] = [];
  const previousDismissed = new Set(invoice.flags.filter((f) => f.dismissed).map((f) => f.code));
  const today = todayISO();

  const history = invoice.supplierId
    ? await db
        .select()
        .from(schema.invoices)
        .where(
          and(
            eq(schema.invoices.companyId, invoice.companyId),
            eq(schema.invoices.supplierId, invoice.supplierId),
            ne(schema.invoices.id, invoice.id),
          ),
        )
        .orderBy(desc(schema.invoices.issueDate))
        .limit(50)
    : [];
  const active = history.filter((h) => h.status !== "rejected");

  // Dubletter
  let duplicateOf: string | null = opts?.fileDuplicateOf ? "fil" : null;
  let dupReason = opts?.fileDuplicateOf ? "Præcis samme fil er uploadet før" : "";
  if (!duplicateOf && invoice.invoiceNumber) {
    const same = active.find((h) => h.invoiceNumber && h.invoiceNumber === invoice.invoiceNumber && h.kind === invoice.kind);
    if (same) {
      duplicateOf = same.id;
      dupReason = `Fakturanummer ${invoice.invoiceNumber} er allerede registreret`;
    }
  }
  if (!duplicateOf && invoice.totalAmount && invoice.issueDate) {
    const same = active.find(
      (h) =>
        h.totalAmount === invoice.totalAmount &&
        h.issueDate &&
        Math.abs(daysBetween(h.issueDate, invoice.issueDate!)) <= 3 &&
        h.kind === invoice.kind,
    );
    if (same) {
      duplicateOf = same.id;
      dupReason = `Samme beløb (${formatMoney(invoice.totalAmount)}) og næsten samme dato som en anden faktura`;
    }
  }
  if (duplicateOf) flags.push({ code: "duplicate", severity: "critical", message: `Mulig dublet: ${dupReason}.` });

  // Ændret kontonummer (klassisk CEO-/leverandørsvindel)
  const fp = paymentFingerprint(invoice);
  const trustedHistory = active.filter((h) => ["approved", "scheduled", "paid"].includes(h.status));
  const lastFp = trustedHistory.map((h) => paymentFingerprint(h)).find(Boolean);
  if (fp && lastFp && fp !== lastFp && fp.split(":")[0] === lastFp.split(":")[0]) {
    flags.push({
      code: "bank_changed",
      severity: "critical",
      message:
        "Leverandøren har skiftet betalingsoplysninger siden sidste betaling. Ring til leverandøren på et kendt nummer og bekræft kontonummeret før godkendelse.",
    });
  } else if (fp && lastFp && fp !== lastFp) {
    flags.push({
      code: "bank_changed",
      severity: "warning",
      message: "Leverandøren bruger en anden betalingsmetode end sidst. Kontrollér at oplysningerne er korrekte.",
    });
  }

  // Ny leverandør
  if (invoice.supplierId && active.length === 0 && invoice.kind !== "expense") {
    const big = (invoice.totalAmount ?? 0) >= 5_000_000;
    flags.push({
      code: "new_supplier",
      severity: big ? "warning" : "info",
      message: big
        ? `Første faktura fra denne leverandør, og beløbet er højt (${formatMoney(invoice.totalAmount)}). Kontrollér at leverancen er bestilt.`
        : "Første faktura fra denne leverandør.",
    });
  }

  // Prisudsving
  const amounts = trustedHistory.map((h) => h.totalAmount ?? 0).filter((a) => a > 0).slice(0, 8);
  if (invoice.totalAmount && amounts.length >= 3) {
    const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    if (invoice.totalAmount > avg * 1.5 && invoice.totalAmount - avg > 50_000) {
      flags.push({
        code: "price_jump",
        severity: "warning",
        message: `Beløbet er ${Math.round((invoice.totalAmount / avg - 1) * 100)} % højere end gennemsnittet af de seneste ${amounts.length} fakturaer (${formatMoney(
          Math.round(avg),
        )}).`,
      });
    }
  }

  // Moms og summer
  if (invoice.amountExVat != null && invoice.vatAmount != null && invoice.totalAmount != null) {
    if (Math.abs(invoice.amountExVat + invoice.vatAmount - invoice.totalAmount) > 100) {
      flags.push({
        code: "sum_mismatch",
        severity: "warning",
        message: "Beløb ekskl. moms + moms svarer ikke til totalbeløbet.",
      });
    }
    const expectedVat = Math.round(invoice.amountExVat * 0.25);
    if (invoice.vatAmount > 0 && Math.abs(expectedVat - invoice.vatAmount) > 100 && invoice.currency === "DKK") {
      flags.push({
        code: "vat_mismatch",
        severity: "info",
        message: `Momsen udgør ${((invoice.vatAmount / invoice.amountExVat) * 100).toFixed(1)} % – normalt 25 %. Tjek om fakturaen indeholder momsfrie poster.`,
      });
    }
  }
  const lines = await db.select().from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, invoice.id));
  if (lines.length > 0 && invoice.amountExVat != null) {
    const sum = lines.reduce((s, l) => s + l.amount, 0);
    if (Math.abs(sum - invoice.amountExVat) > 100) {
      flags.push({
        code: "sum_mismatch",
        severity: "warning",
        message: `Fakturalinjerne summerer til ${formatMoney(sum)}, men beløbet ekskl. moms er ${formatMoney(invoice.amountExVat)}.`,
      });
    }
  }

  // Betaling
  const needsPayment = !["betalingsservice", "card", "none"].includes(invoice.paymentMethod ?? "");
  if (needsPayment && invoice.kind !== "credit_note") {
    const hasPayment =
      (invoice.paymentMethod === "fik" && invoice.fikCreditor) ||
      (invoice.paymentMethod === "domestic" && invoice.bankReg && invoice.bankAccount) ||
      (invoice.paymentMethod === "iban" && invoice.iban) ||
      invoice.kind === "expense";
    if (!hasPayment) {
      flags.push({ code: "missing_payment_info", severity: "warning", message: "Der mangler betalingsoplysninger (FI-kort, kontonummer eller IBAN)." });
    }
  }
  if (invoice.iban && !invoice.iban.startsWith("DK")) {
    flags.push({ code: "foreign_iban", severity: "info", message: `Betaling til udenlandsk konto (${invoice.iban.slice(0, 2)}).` });
  }
  if (invoice.kind !== "expense" && invoice.dueDate && invoice.dueDate < today && !["paid", "archived", "rejected"].includes(invoice.status)) {
    flags.push({ code: "overdue", severity: "warning", message: `Fakturaen forfaldt for ${daysBetween(invoice.dueDate, today)} dage siden.` });
  }
  if (invoice.discountDate && invoice.discountDate >= today && invoice.discountAmount && invoice.totalAmount) {
    flags.push({
      code: "discount_available",
      severity: "info",
      message: `Spar ${formatMoney(invoice.totalAmount - invoice.discountAmount)} ved betaling senest ${invoice.discountDate}. Fluks planlægger betalingen, så rabatten udnyttes.`,
    });
  }

  // Lav AI-sikkerhed
  const conf = invoice.extraction?.confidence ?? {};
  const low = Object.entries(conf).filter(([, v]) => (v ?? 1) < 0.6);
  if (low.length) {
    const labels: Record<string, string> = { supplier: "leverandør", invoiceNumber: "fakturanummer", dates: "datoer", amounts: "beløb", payment: "betaling" };
    flags.push({
      code: "low_confidence",
      severity: "info",
      message: `AI er usikker på: ${low.map(([k]) => labels[k] ?? k).join(", ")}. Kontrollér felterne.`,
    });
  }

  return flags.map((f) => (previousDismissed.has(f.code) && f.severity !== "critical" ? { ...f, dismissed: true } : f));
}

export function blockingFlags(flags: InvoiceFlag[]) {
  return flags.filter((f) => !f.dismissed && (f.severity === "critical" || f.severity === "warning"));
}

export async function refreshChecks(db: DB, invoiceIds: string[]) {
  if (!invoiceIds.length) return;
  const rows = await db.select().from(schema.invoices).where(inArray(schema.invoices.id, invoiceIds));
  for (const inv of rows) {
    const flags = await runChecks(db, inv);
    await db.update(schema.invoices).set({ flags }).where(eq(schema.invoices.id, inv.id));
  }
}
