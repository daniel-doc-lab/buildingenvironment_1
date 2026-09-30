import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const dkk = new Intl.NumberFormat("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dkk0 = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 });

/** Formaterer øre som "12.345,67 kr." */
export function formatMoney(ore: number | null | undefined, currency = "DKK", opts?: { compact?: boolean }) {
  if (ore == null) return "–";
  const value = ore / 100;
  const s = opts?.compact ? dkk0.format(Math.round(value)) : dkk.format(value);
  if (currency === "DKK") return `${s} kr.`;
  return `${s} ${currency}`;
}

/** Parser dansk/engelsk beløbstekst til øre. "1.234,50" -> 123450, "1,234.50" -> 123450 */
export function parseAmount(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  if (typeof input === "number") return Math.round(input * 100);
  let s = input.replace(/\s|kr\.?|dkk|eur|€/gi, "").trim();
  if (!s) return null;
  const neg = /^-|-$/.test(s) || /^\(.*\)$/.test(s);
  s = s.replace(/[-()]/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    // "1.234" (dansk tusindtal) vs "1234.50"
    const decimals = s.length - lastDot - 1;
    if (decimals === 3 && lastComma === -1 && (s.match(/\./g)?.length ?? 0) >= 1) s = s.replace(/\./g, "");
    else s = s.replace(/,/g, "");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) * (neg ? -1 : 1);
}

export function toInputAmount(ore: number | null | undefined) {
  if (ore == null) return "";
  return (ore / 100).toFixed(2).replace(".", ",");
}

const dateFmt = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", year: "numeric" });
const dateShort = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short" });

export function formatDate(d: string | Date | null | undefined, short = false) {
  if (!d) return "–";
  const date = typeof d === "string" ? new Date(d.length === 10 ? d + "T12:00:00" : d) : d;
  if (Number.isNaN(date.getTime())) return "–";
  return (short ? dateShort : dateFmt).format(date);
}

export function formatDateTime(d: Date | string | null | undefined) {
  if (!d) return "–";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return isoDate(d);
}

export function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, days: number) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export function daysBetween(fromIso: string, toIso: string) {
  const a = new Date(fromIso + "T12:00:00").getTime();
  const b = new Date(toIso + "T12:00:00").getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Relativ forfaldstekst: "om 3 dage", "i dag", "3 dage over" */
export function dueLabel(due: string | null | undefined) {
  if (!due) return { text: "Ingen forfaldsdato", tone: "muted" as const };
  const d = daysBetween(todayISO(), due);
  if (d < 0) return { text: `${-d} ${-d === 1 ? "dag" : "dage"} over forfald`, tone: "danger" as const };
  if (d === 0) return { text: "Forfalder i dag", tone: "warning" as const };
  if (d <= 3) return { text: `Forfalder om ${d} ${d === 1 ? "dag" : "dage"}`, tone: "warning" as const };
  return { text: `Forfalder om ${d} dage`, tone: "muted" as const };
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function pct(n: number) {
  return `${Math.round(n * 100)} %`;
}
