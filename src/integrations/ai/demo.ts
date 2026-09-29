import { parseFik, normalizeCvr, validCvr, normalizeIban, validIban } from "@/lib/banking";
import type { AIProvider, CodingContext, CodingSuggestion, ExtractInput, Extraction } from "./types";

/**
 * Demo-AI: regelbaseret aflæsning af danske fakturaer og kontering ud fra historik og nøgleord.
 * Virker uden API-nøgle. Skift til Claude ved at sætte ANTHROPIC_API_KEY.
 */
export class DemoProvider implements AIProvider {
  readonly name = "demo" as const;

  async extract(input: ExtractInput): Promise<Extraction> {
    const text = input.text ?? "";
    return extractFromText(text, { companyCvr: input.companyCvr ?? null, fileName: input.fileName });
  }

  async suggestCoding(lines: { description: string; amount: number }[], ctx: CodingContext): Promise<CodingSuggestion[]> {
    return lines.map((l) => suggestLine(l.description, ctx));
  }
}

// ---------------------------------------------------------------------------
// Aflæsning
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  januar: 1, februar: 2, marts: 3, april: 4, maj: 5, juni: 6, juli: 7, august: 8, september: 9, oktober: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dec: 12,
};

export function parseDanishDate(s: string | undefined | null): string | null {
  if (!s) return null;
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return fmt(+m[1]!, +m[2]!, +m[3]!);
  m = s.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/);
  if (m) {
    let y = +m[3]!;
    if (y < 100) y += 2000;
    return fmt(y, +m[2]!, +m[1]!);
  }
  m = s.match(/(\d{1,2})\.?\s+([a-zæøå]+)\.?\s+(\d{4})/i);
  if (m && MONTHS[m[2]!.toLowerCase()]) return fmt(+m[3]!, MONTHS[m[2]!.toLowerCase()]!, +m[1]!);
  return null;
}

function fmt(y: number, mo: number, d: number) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function num(s: string | undefined | null): number | null {
  if (!s) return null;
  let t = s.replace(/[^\d.,-]/g, "");
  if (!t) return null;
  const lc = t.lastIndexOf(",");
  const ld = t.lastIndexOf(".");
  if (lc > ld) t = t.replace(/\./g, "").replace(",", ".");
  else if (ld > lc && lc !== -1) t = t.replace(/,/g, "");
  else if (ld > -1 && t.length - ld - 1 === 3 && lc === -1) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const AMOUNT = String.raw`(-?\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})|-?\d+(?:[.,]\d{2}))`;

function findLabeledAmount(text: string, labels: string[]): number | null {
  let best: number | null = null;
  for (const label of labels) {
    const re = new RegExp(`${label}[^\\n\\d-]{0,40}${AMOUNT}`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) best = num(m[1]);
    if (best != null) return best;
  }
  return best;
}

function findLabeledDate(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(`${label}[^\\n\\d]{0,25}(\\d{1,2}[.\\-/]\\d{1,2}[.\\-/]\\d{2,4}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}\\.?\\s+[a-zæøå]+\\.?\\s+\\d{4})`, "i");
    const m = text.match(re);
    if (m) {
      const d = parseDanishDate(m[1]);
      if (d) return d;
    }
  }
  return null;
}

export function extractFromText(text: string, opts: { companyCvr: string | null; fileName?: string }): Extraction {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const lines = clean.split("\n").map((l) => l.trim()).filter(Boolean);

  // Dokumenttype
  const lower = clean.toLowerCase();
  const documentType: Extraction["documentType"] = /kreditnota|credit note/.test(lower)
    ? "credit_note"
    : /rykker|påmindelse/.test(lower)
      ? "reminder"
      : /kvittering|receipt|bon nr/.test(lower)
        ? "receipt"
        : "invoice";

  // CVR – første CVR der ikke er vores eget
  const cvrs = [...clean.matchAll(/(?:CVR|SE|VAT)[\s.\-]*(?:nr\.?|nummer|no\.?)?[\s.:]*(?:DK)?[\s-]?(\d{2}\s?\d{2}\s?\d{2}\s?\d{2})/gi)]
    .map((m) => normalizeCvr(m[1]))
    .filter((c): c is string => !!c && c !== normalizeCvr(opts.companyCvr));
  const supplierCvr = cvrs.find((c) => validCvr(c)) ?? cvrs[0] ?? null;

  // Leverandørnavn: første linje der ligner et firmanavn
  const companyLine = lines.find((l) => /(A\/S|ApS|I\/S|IVS|P\/S|K\/S)(\s|$)/.test(l) && !/kunde|til:/i.test(l));
  const nameLine =
    companyLine?.match(/^(.*?(?:A\/S|ApS|I\/S|IVS|P\/S|K\/S))(?=\s|$)/)?.[1]?.trim() ??
    lines
      .find((l) => l.length > 2 && l.length < 60 && !/faktura|invoice|side|dato|kvittering|cvr/i.test(l) && /[a-zæøå]/i.test(l))
      ?.replace(/\s+(FAKTURA|KREDITNOTA|INVOICE|KVITTERING)$/i, "") ??
    null;

  const invoiceNumber =
    clean.match(/(?:Faktura|Kreditnota|Invoice|Bilag)\s*(?:nummer|nr\.?|no\.?|#)\s*[:.]?\s*([A-Z0-9][A-Z0-9\-/]{1,24})/i)?.[1] ??
    clean.match(/(?:Fakturanr|Fakturanummer)\.?\s*[:.]?\s*([A-Z0-9\-/]{2,24})/i)?.[1] ??
    null;

  const issueDate = findLabeledDate(clean, ["Fakturadato", "Faktura dato", "Dato", "Invoice date", "Udstedt"]);
  let dueDate = findLabeledDate(clean, [
    "Sidste rettidige betalingsdato",
    "Forfaldsdato",
    "Forfald",
    "Betalingsdato",
    "Betales senest",
    "Due date",
    "Betalingsfrist",
  ]);
  if (!dueDate && issueDate) {
    const netto = clean.match(/netto\s*(\d{1,3})\s*dage/i) ?? clean.match(/(\d{1,3})\s*dage\s*netto/i);
    if (netto) {
      const d = new Date(issueDate + "T12:00:00");
      d.setDate(d.getDate() + Number(netto[1]));
      dueDate = d.toISOString().slice(0, 10);
    }
  }

  const totalAmount = findLabeledAmount(clean, [
    "At betale",
    "Total inkl\\.? moms",
    "I alt inkl\\.? moms",
    "Beløb i alt",
    "Total DKK",
    "Totalbeløb",
    "I alt",
    "Total",
    "Amount due",
  ]);
  const vatAmount = findLabeledAmount(clean, ["Moms 25 ?%", "Heraf moms", "Moms", "VAT"]);
  let amountExVat = findLabeledAmount(clean, ["Subtotal", "Beløb ekskl\\.? moms", "Ekskl\\.? moms", "Netto", "Total ekskl\\.? moms"]);
  if (amountExVat == null && totalAmount != null && vatAmount != null) amountExVat = round2(totalAmount - vatAmount);

  // Betaling
  const fik = parseFik(clean.replace(/\n/g, " "));
  const regAcc = clean.match(/Reg\.?\s*(?:nr\.?)?\s*[:.]?\s*(\d{4})\s*[,/\-–]?\s*(?:Konto(?:nr|nummer)?\.?\s*[:.]?\s*)?(\d{6,10})/i);
  const ibanMatch = clean.match(/\b(?:IBAN)?\s*[:.]?\s*([A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?)\b/);
  const iban = ibanMatch && validIban(ibanMatch[1]) ? normalizeIban(ibanMatch[1]) : null;
  const bic = clean.match(/(?:BIC|SWIFT)\s*[:.]?\s*([A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)/)?.[1] ?? null;
  const betalingsservice = /betalingsservice|pbs-nr|trækkes via/i.test(clean);
  const paidByCard = /betalt med (?:kort|dankort|visa|mastercard)|betalt\b/i.test(clean) && documentType === "receipt";

  let paymentMethod: Extraction["paymentMethod"] = "unknown";
  if (betalingsservice) paymentMethod = "betalingsservice";
  else if (paidByCard) paymentMethod = "card";
  else if (fik) paymentMethod = "fik";
  else if (regAcc) paymentMethod = "domestic";
  else if (iban) paymentMethod = "iban";

  const discount = clean.match(/kontantrabat[^\n]*?(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4})[^\n]*?(?:betal(?:es)?|beløb)[^\n\d]*([\d.,]+)/i);
  const deliveryAddress =
    clean.match(/(?:Leveringsadresse|Arbejdssted|Adresse for arbejdet|Ejendom|Vedr\.?)\s*[:.]?\s*([^\n]{5,70})/i)?.[1]?.trim() ?? null;

  // Linjer: tekst efterfulgt af beløb, mellem "Beskrivelse"/"Tekst" og "Subtotal"/"I alt"
  const extractedLines: Extraction["lines"] = [];
  const startIdx = lines.findIndex((l) => /^(beskrivelse|tekst|varenr|ydelse|description)\b/i.test(l));
  const endIdx = lines.findIndex((l, i) => i > startIdx && /^(subtotal|i alt|total|moms|beløb ekskl|netto)/i.test(l));
  if (startIdx >= 0) {
    for (const l of lines.slice(startIdx + 1, endIdx > 0 ? endIdx : startIdx + 30)) {
      const m = l.match(new RegExp(`^(.+?)\\s+(?:(\\d+(?:[.,]\\d+)?)\\s*(?:stk\\.?|timer|t|x|md\\.?|mdr\\.?|m2|kwh|m3|liter)?\\s+)?(?:${AMOUNT}\\s+)?${AMOUNT}$`, "i"));
      if (m && /[a-zæøå]/i.test(m[1]!)) {
        const qty = m[2] ? num(m[2]) : null;
        const unit = m[3] ? num(m[3]) : null;
        const amt = num(m[4]);
        if (amt != null) extractedLines.push({ description: m[1]!.trim(), quantity: qty ?? 1, unitPrice: unit ?? amt, amount: amt, vatRate: 0.25 });
      }
    }
  }
  if (extractedLines.length === 0 && (amountExVat != null || totalAmount != null)) {
    const net = amountExVat ?? (totalAmount != null ? round2(totalAmount / 1.25) : 0);
    const desc =
      clean.match(/(?:Vedr\.?|Vedrørende|Beskrivelse|Tekst)\s*[:.]?\s*([^\n]{3,80})/i)?.[1]?.trim() ??
      (nameLine ? `Faktura fra ${nameLine}` : "Faktura");
    extractedLines.push({ description: desc, quantity: 1, unitPrice: net, amount: net, vatRate: vatAmount === 0 ? 0 : 0.25 });
  }

  const hasText = clean.trim().length > 20;
  const confidence = {
    supplier: supplierCvr ? 0.95 : nameLine ? 0.6 : 0.1,
    invoiceNumber: invoiceNumber ? 0.9 : 0.1,
    dates: dueDate ? (issueDate ? 0.92 : 0.75) : 0.2,
    amounts: totalAmount != null ? (vatAmount != null ? 0.95 : 0.75) : 0.1,
    payment: fik || regAcc || iban || betalingsservice || paidByCard ? 0.93 : 0.2,
  };

  return {
    documentType,
    supplierName: nameLine,
    supplierCvr,
    supplierAddress: null,
    supplierEmail: clean.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? null,
    invoiceNumber,
    issueDate,
    dueDate,
    currency: /\bEUR\b|€/.test(clean) && !/\bDKK\b|kr\./.test(clean) ? "EUR" : "DKK",
    amountExVat,
    vatAmount,
    totalAmount,
    paymentMethod,
    fikLine: fik ? `+${fik.type}<${fik.paymentId ?? ""}+${fik.creditor}<` : null,
    bankReg: regAcc?.[1] ?? null,
    bankAccount: regAcc?.[2] ?? null,
    iban,
    bic,
    paymentReference: clean.match(/(?:Betalingsreference|Betalings-id|Reference)\s*[:.]?\s*([A-Z0-9\-]*\d[A-Z0-9\-]*)/i)?.[1] ?? null,
    discountDate: discount ? parseDanishDate(discount[1]) : null,
    discountAmount: discount ? num(discount[2]) : null,
    deliveryAddress,
    lines: extractedLines,
    summary: hasText
      ? `${documentType === "credit_note" ? "Kreditnota" : "Faktura"} fra ${nameLine ?? "ukendt leverandør"}${
          extractedLines[0] ? ` vedr. ${extractedLines[0].description.toLowerCase()}` : ""
        }`
      : "Dokumentet indeholder ingen læsbar tekst (fx et foto). Udfyld felterne manuelt, eller tilslut Claude for billedgenkendelse.",
    confidence,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Kontering
// ---------------------------------------------------------------------------

/** Nøgleord -> ord der typisk indgår i kontonavnet. */
const KEYWORDS: [RegExp, RegExp][] = [
  [/\b(el|strøm|elektricitet|kwh|elforbrug)\b/i, /el\b|elektricitet|energi|el, vand/i],
  [/\b(vand|vandforbrug|m3|kloak|afledning)\b/i, /vand|forsyning/i],
  [/\b(varme|fjernvarme|gas|olie)\b/i, /varme|forsyning/i],
  [/\b(renovation|affald|skrald|container)\b/i, /renovation|affald/i],
  [/\b(rengøring|trappevask|vinduespudsning|puds)\b/i, /rengøring/i],
  [/\b(vicevært|ejendomsservice|havearbejde|snerydning|gartner|græsslåning)\b/i, /vicevært|ejendomsservice|drift/i],
  [/\b(vvs|blikkensl\w*|rør|tømrer|maler|maling|murer|elektriker|reparation|udskiftning|lås|låsesmed|cylinderlås|tag|vedligehold\w*|håndværk\w*|pærer?|led|silikone|fuge\w*|materialer|byggemarked|skruer|værktøj)\b/i, /vedligehold|reparation/i],
  [/\b(forsikring|police|præmie)\b/i, /forsikring/i],
  [/\b(licens|software|abonnement|saas|cloud|hosting|microsoft|google workspace|adobe|server|domæne)\b/i, /software|it\b|edb/i],
  [/\b(telefon|mobil|internet|bredbånd|fiber|tele)\b/i, /telefon|internet/i],
  [/\b(revision|revisor|årsrapport|regnskab|bogføring|bogholderi)\b/i, /revision|regnskab/i],
  [/\b(advokat|juridisk|rådgivning|konsulent)\b/i, /rådgivning|advokat|konsulent/i],
  [/\b(husleje|leje af lokaler|kontorleje)\b/i, /husleje|lokale/i],
  [/\b(kontorartikler|papir|toner|printer|kuglepenne)\b/i, /kontorartikler|kontorhold/i],
  [/\b(annonce|markedsføring|marketing|reklame|facebook|google ads|tryksager)\b/i, /annonce|reklame|markedsføring/i],
  [/\b(fly|hotel|taxa|tog|rejse|overnatning)\b/i, /rejse/i],
  [/\b(frokost|forplejning|kaffe|mad|restaurant|kantine|møde)\b/i, /repræsentation|personaleudgift|forplejning/i],
  [/\b(benzin|diesel|brændstof|ladning|opladning|parkering|bilvask|værksted)\b/i, /bil|brændstof|autodrift/i],
  [/\b(fragt|porto|forsendelse|gls|postnord|dao)\b/i, /fragt|porto/i],
  [/\b(kursus|uddannelse|konference)\b/i, /uddannelse|kursus/i],
  [/\b(varekøb|varer|råvarer|lager)\b/i, /varekøb/i],
];

export function suggestLine(description: string, ctx: CodingContext): CodingSuggestion {
  const desc = description.toLowerCase();
  const propertyId = matchProperty(ctx);

  // 1) Historik for leverandøren – mest brugte konto, helst med lignende tekst
  if (ctx.history.length > 0) {
    const similar = ctx.history.filter((h) => h.accountNumber && overlap(h.description.toLowerCase(), desc) >= 0.5);
    const pool = similar.length ? similar : ctx.history.filter((h) => h.accountNumber);
    if (pool.length) {
      const counts = new Map<string, { n: number; vat: string | null; prop: string | null }>();
      for (const h of pool) {
        const c = counts.get(h.accountNumber!) ?? { n: 0, vat: h.vatCode, prop: h.propertyId };
        c.n++;
        counts.set(h.accountNumber!, c);
      }
      const [acc, info] = [...counts.entries()].sort((a, b) => b[1].n - a[1].n)[0]!;
      const share = info.n / pool.length;
      const account = ctx.accounts.find((a) => a.number === acc);
      return {
        accountNumber: acc,
        vatCode: info.vat ?? account?.defaultVatCode ?? null,
        propertyId: propertyId ?? info.prop,
        departmentCode: null,
        confidence: Math.min(0.97, 0.7 + share * 0.25 + (similar.length ? 0.05 : 0)),
        reason: `Samme konto som ${info.n} tidligere ${info.n === 1 ? "faktura" : "fakturaer"} fra ${ctx.supplierName ?? "leverandøren"}`,
      };
    }
  }

  // 2) Nøgleord i linjetekst eller branche
  const haystack = `${desc} ${ctx.supplierName ?? ""} ${ctx.supplierIndustry ?? ""}`.toLowerCase();
  for (const [kw, accName] of KEYWORDS) {
    if (kw.test(haystack)) {
      const matching = ctx.accounts.filter((a) => accName.test(a.name));
      // Vedrører udgiften en ejendom, foretrækkes ejendomskonti
      const account = (propertyId ? matching.find((a) => /^ejendom/i.test(a.name)) : matching.find((a) => !/^ejendom/i.test(a.name))) ?? matching[0];
      if (account) {
        const hit = haystack.match(kw)?.[0];
        return {
          accountNumber: account.number,
          vatCode: account.defaultVatCode,
          propertyId,
          departmentCode: null,
          confidence: 0.72,
          reason: `Teksten nævner "${hit}", som passer til kontoen ${account.name}`,
        };
      }
    }
  }

  // 3) Fallback
  const fallback = ctx.accounts.find((a) => /øvrige|diverse|andre/i.test(a.name));
  return {
    accountNumber: fallback?.number ?? null,
    vatCode: fallback?.defaultVatCode ?? null,
    propertyId,
    departmentCode: null,
    confidence: fallback ? 0.35 : 0,
    reason: fallback ? "Ingen sikre signaler – foreslår diverse-konto" : "",
  };
}

export function matchProperty(ctx: Pick<CodingContext, "properties" | "documentText" | "deliveryAddress">): string | null {
  const text = `${ctx.deliveryAddress ?? ""}\n${ctx.documentText ?? ""}`.toLowerCase();
  if (!text.trim()) return null;
  for (const p of ctx.properties) {
    const street = p.address?.toLowerCase().split(",")[0]?.trim();
    if (street && street.length > 4 && text.includes(street)) return p.id;
    if (p.name.length > 5 && text.includes(p.name.toLowerCase())) return p.id;
  }
  return null;
}

function overlap(a: string, b: string) {
  const wa = new Set(a.split(/\W+/).filter((w) => w.length > 3));
  const wb = new Set(b.split(/\W+/).filter((w) => w.length > 3));
  if (!wa.size || !wb.size) return 0;
  let n = 0;
  for (const w of wa) if (wb.has(w)) n++;
  return n / Math.min(wa.size, wb.size);
}
