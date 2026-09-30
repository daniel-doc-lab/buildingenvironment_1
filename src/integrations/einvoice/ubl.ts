import { XMLParser } from "fast-xml-parser";
import { normalizeCvr } from "@/lib/banking";
import type { Extraction } from "@/integrations/ai/types";

/**
 * Parser for elektroniske fakturaer: OIOUBL 2.x (NemHandel) og Peppol BIS Billing 3.0.
 * Understøtter Invoice og CreditNote.
 */

type X = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
  textNodeName: "#text",
  parseTagValue: false,
  isArray: (name) => ["InvoiceLine", "CreditNoteLine", "PaymentMeans", "TaxSubtotal", "Note", "PartyIdentification", "PartyTaxScheme"].includes(name),
});

function t(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number") return String(v).trim() || null;
  if (typeof v === "object" && "#text" in (v as X)) return String((v as X)["#text"]).trim() || null;
  return null;
}
function attr(v: unknown, a: string): string | null {
  if (v && typeof v === "object" && `@${a}` in (v as X)) return String((v as X)[`@${a}`]);
  return null;
}
function n(v: unknown): number | null {
  const s = t(v);
  if (s == null) return null;
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
}
function g(o: unknown, ...path: string[]): unknown {
  let cur: unknown = o;
  for (const p of path) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) cur = cur[0];
    cur = (cur as X)[p];
  }
  return Array.isArray(cur) && path.length ? cur : cur;
}
function first(v: unknown): unknown {
  return Array.isArray(v) ? v[0] : v;
}

export function isUbl(text: string) {
  return /<(?:\w+:)?(Invoice|CreditNote)\b[^>]*urn:oasis:names:specification:ubl/i.test(text.slice(0, 4000));
}

export function parseUbl(xml: string): Extraction {
  const doc = parser.parse(xml) as X;
  const isCredit = !!doc.CreditNote;
  const root = (doc.Invoice ?? doc.CreditNote) as X;
  if (!root) throw new Error("Ikke et gyldigt UBL-dokument");

  const supplierParty = g(root, "AccountingSupplierParty", "Party") as X;
  const supplierName =
    t(g(supplierParty, "PartyName", "Name")) ?? t(g(supplierParty, "PartyLegalEntity", "RegistrationName")) ?? null;

  const candidates: (string | null)[] = [];
  const endpoint = g(supplierParty, "EndpointID");
  candidates.push(t(endpoint));
  candidates.push(t(g(supplierParty, "PartyLegalEntity", "CompanyID")));
  for (const pts of (g(supplierParty, "PartyTaxScheme") as unknown[]) ?? []) candidates.push(t((pts as X).CompanyID));
  for (const pid of (g(supplierParty, "PartyIdentification") as unknown[]) ?? []) candidates.push(t((pid as X).ID));
  const supplierCvr = candidates.map((c) => normalizeCvr(c)).find(Boolean) ?? null;

  const addr = g(supplierParty, "PostalAddress") as X | undefined;
  const supplierAddress = addr
    ? [t(addr.StreetName), t(addr.BuildingNumber), t(addr.PostalZone), t(addr.CityName)].filter(Boolean).join(" ")
    : null;

  const totals = root.LegalMonetaryTotal as X | undefined;
  const payable = n(totals?.PayableAmount) ?? n(totals?.TaxInclusiveAmount);
  const exVat = n(totals?.TaxExclusiveAmount) ?? n(totals?.LineExtensionAmount);
  const vat = n(g(first(root.TaxTotal), "TaxAmount"));

  // Betaling
  const pms = (root.PaymentMeans as X[] | undefined) ?? [];
  let paymentMethod: Extraction["paymentMethod"] = "unknown";
  let fikLine: string | null = null;
  let bankReg: string | null = null;
  let bankAccount: string | null = null;
  let iban: string | null = null;
  let bic: string | null = null;
  let paymentReference: string | null = null;
  let dueDate = t(root.DueDate);
  for (const pm of pms) {
    const code = t(pm.PaymentMeansCode);
    const channel = t(pm.PaymentChannelCode);
    dueDate ??= t(pm.PaymentDueDate);
    const accountId = t(g(pm, "PayeeFinancialAccount", "ID"));
    const branch =
      t(g(pm, "PayeeFinancialAccount", "FinancialInstitutionBranch", "ID")) ??
      t(g(pm, "PayeeFinancialAccount", "FinancialInstitutionBranch", "FinancialInstitution", "ID"));
    if (code === "93" || channel === "DK:FIK") {
      const kind = (t(pm.PaymentID) ?? "71").replace(/\D/g, "") || "71";
      const pid = t(pm.InstructionID) ?? "";
      const creditor = t(g(pm, "CreditAccount", "AccountID")) ?? accountId ?? "";
      fikLine = `+${kind}<${pid}+${creditor.padStart(8, "0")}<`;
      paymentMethod = "fik";
      break;
    }
    if (channel === "IBAN" || (accountId && /^[A-Z]{2}\d{2}/.test(accountId))) {
      iban = accountId?.replace(/\s/g, "") ?? null;
      bic = branch && /^[A-Z]{6}/.test(branch) ? branch : bic;
      paymentMethod = "iban";
    } else if (accountId) {
      bankAccount = accountId.replace(/\D/g, "");
      bankReg = branch?.replace(/\D/g, "").slice(0, 4) ?? null;
      if (!bankReg && bankAccount.length === 14) {
        bankReg = bankAccount.slice(0, 4);
        bankAccount = bankAccount.slice(4);
      }
      paymentMethod = "domestic";
    }
    paymentReference = t(pm.PaymentID) ?? t(pm.InstructionNote) ?? paymentReference;
    if (code === "49" || code === "59") paymentMethod = "betalingsservice";
  }

  const lineNodes = ((isCredit ? root.CreditNoteLine : root.InvoiceLine) as X[] | undefined) ?? [];
  const lines: Extraction["lines"] = lineNodes.map((l) => {
    const qty = n(isCredit ? l.CreditedQuantity : l.InvoicedQuantity);
    const amount = n(l.LineExtensionAmount) ?? 0;
    const item = l.Item as X | undefined;
    const percent = n(g(item, "ClassifiedTaxCategory", "Percent"));
    return {
      description: t(item?.Name) ?? t(first(item?.Description)) ?? t(first(l.Note)) ?? "Linje",
      quantity: qty,
      unitPrice: n(g(l, "Price", "PriceAmount")),
      amount,
      vatRate: percent != null ? percent / 100 : null,
    };
  });

  const deliveryAddr = g(first(root.Delivery), "DeliveryLocation", "Address") as X | undefined;
  const deliveryAddress = deliveryAddr
    ? [t(deliveryAddr.StreetName), t(deliveryAddr.BuildingNumber), t(deliveryAddr.PostalZone), t(deliveryAddr.CityName)]
        .filter(Boolean)
        .join(" ")
    : null;

  const currency = t(root.DocumentCurrencyCode) ?? attr(totals?.PayableAmount, "currencyID") ?? "DKK";
  const note = t(first(root.Note));

  return {
    documentType: isCredit ? "credit_note" : "invoice",
    supplierName,
    supplierCvr,
    supplierAddress,
    supplierEmail: t(g(supplierParty, "Contact", "ElectronicMail")),
    invoiceNumber: t(root.ID),
    issueDate: t(root.IssueDate),
    dueDate,
    currency,
    amountExVat: exVat,
    vatAmount: vat,
    totalAmount: payable,
    paymentMethod,
    fikLine,
    bankReg,
    bankAccount,
    iban,
    bic,
    paymentReference,
    discountDate: null,
    discountAmount: null,
    deliveryAddress,
    lines,
    summary: `E-faktura (${isCredit ? "kreditnota" : "faktura"}) fra ${supplierName ?? "ukendt"} modtaget via NemHandel/Peppol${
      note ? ` – ${note.slice(0, 80)}` : ""
    }`,
    confidence: { supplier: 1, invoiceNumber: 1, dates: dueDate ? 1 : 0.6, amounts: 1, payment: paymentMethod === "unknown" ? 0.3 : 1 },
  };
}
