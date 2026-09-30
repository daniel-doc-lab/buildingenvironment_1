/**
 * Danske betalingsformater: FI-kort (indbetalingskort), reg./kontonummer, IBAN og CVR.
 */

export type FikCode = { type: string; paymentId: string | null; creditor: string };

/**
 * Parser en FI-kodelinje, fx "+71<000000012345678+85012345<" eller "+71 000000012345678 +85012345".
 * Kortart 71/75 har 15/16-cifret betalings-id, 73 har intet id, 01/04/15 (girokort) har variabel.
 */
export function parseFik(input: string): FikCode | null {
  const s = input.replace(/\s+/g, "");
  const m = s.match(/\+?(01|04|15|71|73|75)<?(\d{0,16})?\+(\d{7,8})</) ?? s.match(/\+?(01|04|15|71|73|75)<?(\d{0,16})\+(\d{7,8})/);
  if (!m) return null;
  const type = m[1]!;
  const paymentId = m[2] ? m[2] : null;
  const creditor = m[3]!.padStart(8, "0");
  return { type, paymentId: paymentId || null, creditor };
}

export function formatFik(type?: string | null, paymentId?: string | null, creditor?: string | null) {
  if (!type || !creditor) return null;
  return `+${type}<${paymentId ?? ""}+${creditor}<`;
}

/** Modulus 10-kontrol (Luhn) for FI-kort 71 betalings-id. */
export function validFik71PaymentId(id: string) {
  if (!/^\d{15}$/.test(id)) return false;
  return luhn(id);
}

export function luhn(num: string) {
  let sum = 0;
  let dbl = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = Number(num[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

/** Validerer CVR med modulus 11 (vægte 2,7,6,5,4,3,2,1). */
export function validCvr(cvr: string | null | undefined) {
  if (!cvr) return false;
  const s = cvr.replace(/\D/g, "");
  if (s.length !== 8 || s[0] === "0") return false;
  const w = [2, 7, 6, 5, 4, 3, 2, 1];
  const sum = s.split("").reduce((acc, c, i) => acc + Number(c) * w[i]!, 0);
  return sum % 11 === 0;
}

export function normalizeCvr(cvr: string | null | undefined) {
  if (!cvr) return null;
  const s = cvr.replace(/^DK/i, "").replace(/\D/g, "");
  return s.length === 8 ? s : null;
}

export function normalizeReg(reg?: string | null) {
  if (!reg) return null;
  const s = reg.replace(/\D/g, "");
  return s.length === 4 ? s : null;
}

export function normalizeAccount(acc?: string | null) {
  if (!acc) return null;
  const s = acc.replace(/\D/g, "");
  return s.length >= 6 && s.length <= 10 ? s : null;
}

export function formatBankAccount(reg?: string | null, acc?: string | null) {
  if (!reg || !acc) return null;
  return `${reg} ${acc}`;
}

export function normalizeIban(iban?: string | null) {
  if (!iban) return null;
  return iban.replace(/\s+/g, "").toUpperCase();
}

export function validIban(iban?: string | null) {
  const s = normalizeIban(iban);
  if (!s || !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const ch of digits) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1;
}

export function formatIban(iban?: string | null) {
  const s = normalizeIban(iban);
  return s ? s.replace(/(.{4})/g, "$1 ").trim() : null;
}

/** Danske IBAN: DKkk RRRR AAAAAAAAAA -> reg + konto */
export function danishIbanToBban(iban?: string | null) {
  const s = normalizeIban(iban);
  if (!s?.startsWith("DK") || s.length !== 18) return null;
  return { reg: s.slice(4, 8), account: s.slice(8) };
}

export function bbanToDanishIban(reg: string, account: string) {
  const bban = reg.padStart(4, "0") + account.padStart(10, "0");
  const digits = bban + "1320" + "00"; // D=13, K=20
  let rem = 0;
  for (const ch of digits) rem = (rem * 10 + Number(ch)) % 97;
  const check = String(98 - rem).padStart(2, "0");
  return `DK${check}${bban}`;
}

/** Signatur af betalingsoplysninger, bruges til at opdage ændrede kontonumre (svindel). */
export function paymentFingerprint(p: {
  fikCreditor?: string | null;
  fikType?: string | null;
  bankReg?: string | null;
  bankAccount?: string | null;
  iban?: string | null;
}) {
  if (p.iban) return `iban:${normalizeIban(p.iban)}`;
  if (p.bankReg && p.bankAccount) return `bban:${p.bankReg}-${p.bankAccount.replace(/^0+/, "")}`;
  if (p.fikCreditor) return `fik:${p.fikCreditor.replace(/^0+/, "")}`;
  return null;
}

const BANK_BY_REG: [number, number, string][] = [
  [3000, 3999, "Danske Bank"],
  [4180, 4999, "Danske Bank"],
  [2000, 2999, "Nordea"],
  [5000, 5999, "Jyske Bank"],
  [7000, 7999, "Jyske Bank"],
  [6600, 6900, "Sydbank"],
  [5301, 5499, "Arbejdernes Landsbank"],
  [9000, 9999, "Spar Nord / lokale banker"],
  [8117, 8117, "Nykredit Bank"],
  [6800, 6899, "Vestjysk Bank"],
];

export function bankNameFromReg(reg?: string | null) {
  if (!reg) return null;
  const n = Number(reg);
  return BANK_BY_REG.find(([a, b]) => n >= a && n <= b)?.[2] ?? null;
}
