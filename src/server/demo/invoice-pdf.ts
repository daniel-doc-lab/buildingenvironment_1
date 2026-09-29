import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type DemoInvoiceSpec = {
  supplier: { name: string; cvr: string; address: string; email: string; color?: [number, number, number] };
  customer: { name: string; address: string; cvr?: string | null };
  invoiceNumber: string;
  issueDate: string; // YYYY-MM-DD
  dueDate: string;
  lines: { description: string; quantity: number; unit?: string; unitPrice: number }[]; // kroner ekskl. moms
  vatRate?: number;
  payment:
    | { kind: "fik"; type: "71" | "73" | "75"; paymentId?: string; creditor: string }
    | { kind: "bank"; reg: string; account: string }
    | { kind: "iban"; iban: string; bic: string }
    | { kind: "betalingsservice"; pbs: string }
    | { kind: "card"; last4: string };
  deliveryAddress?: string | null;
  note?: string | null;
  discount?: { date: string; amount: number } | null;
  title?: string;
};

const kr = (n: number) =>
  new Intl.NumberFormat("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n).replace(/ /g, ".");
const dk = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
};

/** Laver en realistisk dansk faktura som PDF (til demo og test). */
export async function renderDemoInvoice(spec: DemoInvoiceSpec): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Faktura ${spec.invoiceNumber}`);
  pdf.setAuthor(spec.supplier.name);
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [r, g, b] = spec.supplier.color ?? [0.05, 0.35, 0.3];
  const color = rgb(r, g, b);
  const grey = rgb(0.35, 0.38, 0.4);
  let y = 790;
  const text = (s: string, x: number, yy: number, opts?: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> }) =>
    page.drawText(s, { x, y: yy, size: opts?.size ?? 10, font: opts?.bold ? bold : font, color: opts?.color ?? rgb(0.1, 0.12, 0.14) });
  const right = (s: string, xRight: number, yy: number, opts?: { size?: number; bold?: boolean }) => {
    const f = opts?.bold ? bold : font;
    const w = f.widthOfTextAtSize(s, opts?.size ?? 10);
    text(s, xRight - w, yy, opts);
  };

  page.drawRectangle({ x: 0, y: 812, width: 595, height: 30, color });
  text(spec.supplier.name, 50, y - 10, { size: 18, bold: true, color });
  text(spec.supplier.address, 50, y - 28, { size: 9, color: grey });
  text(`CVR-nr.: ${spec.supplier.cvr}  ·  ${spec.supplier.email}`, 50, y - 40, { size: 9, color: grey });

  right(spec.title ?? "FAKTURA", 545, y - 10, { size: 20, bold: true });
  y -= 90;
  text("Faktura til:", 50, y, { size: 9, color: grey });
  text(spec.customer.name, 50, y - 14, { bold: true });
  text(spec.customer.address, 50, y - 28);
  if (spec.customer.cvr) text(`Kunde CVR: ${spec.customer.cvr}`, 50, y - 42, { size: 9, color: grey });

  const meta: [string, string][] = [
    ["Fakturanr.:", spec.invoiceNumber],
    ["Fakturadato:", dk(spec.issueDate)],
    ["Forfaldsdato:", dk(spec.dueDate)],
  ];
  meta.forEach(([k, v], i) => {
    text(k, 360, y - i * 14, { size: 10, color: grey });
    right(v, 545, y - i * 14, { bold: true });
  });
  y -= 70;
  if (spec.deliveryAddress) {
    text(`Leveringsadresse: ${spec.deliveryAddress}`, 50, y);
    y -= 22;
  }

  // Linjer
  page.drawRectangle({ x: 45, y: y - 6, width: 505, height: 20, color: rgb(0.94, 0.95, 0.95) });
  text("Beskrivelse", 50, y, { bold: true, size: 9 });
  right("Antal", 360, y, { bold: true, size: 9 });
  right("Stykpris", 450, y, { bold: true, size: 9 });
  right("Beløb", 545, y, { bold: true, size: 9 });
  y -= 24;
  let net = 0;
  for (const l of spec.lines) {
    const amount = Math.round(l.quantity * l.unitPrice * 100) / 100;
    net += amount;
    text(l.description.slice(0, 60), 50, y);
    right(`${String(l.quantity).replace(".", ",")}${l.unit ? ` ${l.unit}` : ""}`, 360, y);
    right(kr(l.unitPrice), 450, y);
    right(kr(amount), 545, y);
    y -= 18;
  }
  const vatRate = spec.vatRate ?? 0.25;
  const vat = Math.round(net * vatRate * 100) / 100;
  const total = Math.round((net + vat) * 100) / 100;
  y -= 6;
  page.drawLine({ start: { x: 300, y: y + 8 }, end: { x: 550, y: y + 8 }, thickness: 0.6, color: grey });
  const totals: [string, string, boolean][] = [
    ["Subtotal", kr(net), false],
    [`Moms ${Math.round(vatRate * 100)} %`, kr(vat), false],
    ["At betale DKK", kr(total), true],
  ];
  for (const [k, v, isBold] of totals) {
    text(k, 320, y - 6, { bold: isBold });
    right(v, 545, y - 6, { bold: isBold });
    y -= 18;
  }
  y -= 20;

  // Betaling
  text("Betalingsoplysninger", 50, y, { bold: true, color });
  y -= 16;
  const p = spec.payment;
  if (p.kind === "fik") {
    text(`Betales via indbetalingskort (FI-kort). Kodelinje:`, 50, y);
    y -= 16;
    text(`+${p.type}<${p.paymentId ?? ""}+${p.creditor}<`, 50, y, { bold: true, size: 12 });
  } else if (p.kind === "bank") {
    text(`Bankoverførsel til Reg.nr. ${p.reg} Kontonr. ${p.account}`, 50, y);
    y -= 14;
    text(`Husk at angive fakturanummer ${spec.invoiceNumber} ved betaling.`, 50, y, { size: 9, color: grey });
  } else if (p.kind === "iban") {
    text(`IBAN: ${p.iban}  BIC: ${p.bic}`, 50, y);
  } else if (p.kind === "card") {
    text(`Betalt med Dankort ****${p.last4}. Tak for købet.`, 50, y);
  } else {
    text(`Beløbet trækkes via Betalingsservice (PBS-nr. ${p.pbs}). Du skal ikke foretage dig noget.`, 50, y);
  }
  y -= 22;
  if (spec.discount) {
    text(`Kontantrabat: Ved betaling senest ${dk(spec.discount.date)} betales kun ${kr(spec.discount.amount)} kr.`, 50, y, { size: 9 });
    y -= 16;
  }
  text(`Betalingsbetingelser: netto ${daysDiff(spec.issueDate, spec.dueDate)} dage. Ved for sen betaling tillægges rente.`, 50, y, {
    size: 9,
    color: grey,
  });
  if (spec.note) text(spec.note, 50, y - 14, { size: 9, color: grey });

  page.drawLine({ start: { x: 50, y: 60 }, end: { x: 545, y: 60 }, thickness: 0.5, color: grey });
  text(`${spec.supplier.name} · ${spec.supplier.address} · CVR ${spec.supplier.cvr}`, 50, 45, { size: 8, color: grey });
  return Buffer.from(await pdf.save());
}

function daysDiff(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

export function invoiceTotals(spec: Pick<DemoInvoiceSpec, "lines" | "vatRate">) {
  const net = spec.lines.reduce((s, l) => s + Math.round(l.quantity * l.unitPrice * 100), 0);
  const vat = Math.round(net * (spec.vatRate ?? 0.25));
  return { net, vat, total: net + vat };
}
