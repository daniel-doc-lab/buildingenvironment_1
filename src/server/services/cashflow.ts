import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import { addDays, todayISO } from "@/lib/utils";

export type CashEvent = {
  date: string;
  amount: number; // øre, negativ = ud
  label: string;
  kind: "payment" | "pending_invoice" | "recurring" | "income";
  certainty: "sikker" | "sandsynlig" | "forventet";
  href?: string;
};

/**
 * Likviditetsprognose: nuværende saldo + planlagte betalinger + fakturaer under godkendelse
 * + forventede tilbagevendende regninger (mønstre i historikken) + tilbagevendende indbetalinger.
 */
export async function forecast(db: DB, companyId: string, days = 60) {
  const today = todayISO();
  const end = addDays(today, days);
  const accounts = await db.select().from(schema.bankAccounts).where(eq(schema.bankAccounts.companyId, companyId));
  const start = accounts.filter((a) => a.currency === "DKK").reduce((s, a) => s + (a.balance ?? 0), 0);
  const events: CashEvent[] = [];

  const payments = await db
    .select()
    .from(schema.payments)
    .where(and(eq(schema.payments.companyId, companyId), inArray(schema.payments.status, ["planned", "in_batch", "submitted"])));
  const coveredInvoices = new Set(payments.map((p) => p.invoiceId).filter(Boolean));
  for (const p of payments) {
    events.push({
      date: p.executionDate < today ? today : p.executionDate,
      amount: -p.amount,
      label: p.creditorName,
      kind: "payment",
      certainty: "sikker",
      href: p.invoiceId ? `/app/invoices/${p.invoiceId}` : undefined,
    });
  }

  const open = await db
    .select()
    .from(schema.invoices)
    .where(and(eq(schema.invoices.companyId, companyId), inArray(schema.invoices.status, ["review", "pending_approval", "approved"])));
  for (const inv of open) {
    if (coveredInvoices.has(inv.id) || !inv.totalAmount || inv.kind === "credit_note") continue;
    if (inv.flags.some((f) => f.code === "duplicate" && !f.dismissed)) continue;
    if (["betalingsservice", "card"].includes(inv.paymentMethod ?? "")) continue;
    const date = inv.dueDate && inv.dueDate > today ? inv.dueDate : addDays(today, 1);
    events.push({ date, amount: -inv.totalAmount, label: inv.supplierName ?? "Faktura", kind: "pending_invoice", certainty: "sandsynlig", href: `/app/invoices/${inv.id}` });
  }

  // Tilbagevendende regninger: leverandører med fakturaer i mindst 3 af de seneste 4 måneder
  const since = addDays(today, -130);
  const hist = await db
    .select({ supplierId: schema.invoices.supplierId, supplierName: schema.invoices.supplierName, issueDate: schema.invoices.issueDate, dueDate: schema.invoices.dueDate, total: schema.invoices.totalAmount, method: schema.invoices.paymentMethod })
    .from(schema.invoices)
    .where(and(eq(schema.invoices.companyId, companyId), gte(schema.invoices.issueDate, since), inArray(schema.invoices.status, ["paid", "archived", "approved", "scheduled", "pending_approval", "review"])));
  const bySupplier = new Map<string, typeof hist>();
  for (const h of hist) {
    if (!h.supplierId || !h.issueDate || !h.total) continue;
    bySupplier.set(h.supplierId, [...(bySupplier.get(h.supplierId) ?? []), h]);
  }
  for (const [, list] of bySupplier) {
    const months = new Set(list.map((l) => l.issueDate!.slice(0, 7)));
    if (months.size < 3) continue;
    const perMonth = new Map<string, number>();
    for (const l of list) perMonth.set(l.issueDate!.slice(0, 7), (perMonth.get(l.issueDate!.slice(0, 7)) ?? 0) + l.total!);
    const avg = Math.round([...perMonth.values()].reduce((s, v) => s + v, 0) / perMonth.size);
    const dueDays = list.map((l) => Number((l.dueDate ?? l.issueDate)!.slice(8, 10)));
    const day = Math.min(28, Math.round(dueDays.reduce((s, d) => s + d, 0) / dueDays.length));
    const latestMonth = [...months].sort().at(-1)!;
    const isBs = list[0]!.method === "betalingsservice";
    for (let m = 1; m <= Math.ceil(days / 30) + 1; m++) {
      const d = new Date(latestMonth + "-15T12:00:00");
      d.setMonth(d.getMonth() + m);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (date <= today || date > end) continue;
      events.push({ date, amount: -avg, label: `${list[0]!.supplierName} (forventet${isBs ? ", BS" : ""})`, kind: "recurring", certainty: "forventet" });
    }
  }

  // Tilbagevendende indbetalinger (fx husleje) ud fra de seneste 3 måneders posteringer
  const inc = await db
    .select()
    .from(schema.bankTransactions)
    .where(and(eq(schema.bankTransactions.companyId, companyId), gte(schema.bankTransactions.bookingDate, addDays(today, -95))));
  const incomeByText = new Map<string, { amounts: number[]; days: number[] }>();
  for (const t of inc) {
    if (t.amount <= 0) continue;
    const key = t.text.toLowerCase().replace(/\d+/g, "").trim();
    const e = incomeByText.get(key) ?? { amounts: [], days: [] };
    e.amounts.push(t.amount);
    e.days.push(Number(t.bookingDate.slice(8, 10)));
    incomeByText.set(key, e);
  }
  for (const [key, e] of incomeByText) {
    if (e.amounts.length < 2) continue;
    const avg = Math.round(e.amounts.reduce((s, v) => s + v, 0) / e.amounts.length);
    const day = Math.min(28, Math.round(e.days.reduce((s, v) => s + v, 0) / e.days.length));
    for (let m = 0; m <= Math.ceil(days / 30) + 1; m++) {
      const d = new Date(today + "T12:00:00");
      d.setDate(1);
      d.setMonth(d.getMonth() + m);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (date <= today || date > end) continue;
      events.push({ date, amount: avg, label: key.charAt(0).toUpperCase() + key.slice(1), kind: "income", certainty: "forventet" });
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date));
  const series: { date: string; balance: number; out: number; in: number }[] = [];
  let bal = start;
  let lowest = { date: today, balance: start };
  for (let i = 0; i <= days; i++) {
    const date = addDays(today, i);
    const dayEvents = events.filter((e) => e.date === date);
    const out = dayEvents.filter((e) => e.amount < 0).reduce((s, e) => s + e.amount, 0);
    const inn = dayEvents.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
    bal += out + inn;
    series.push({ date, balance: bal, out: -out, in: inn });
    if (bal < lowest.balance) lowest = { date, balance: bal };
  }
  const totals = {
    certain: events.filter((e) => e.certainty === "sikker").reduce((s, e) => s + e.amount, 0),
    likely: events.filter((e) => e.certainty === "sandsynlig").reduce((s, e) => s + e.amount, 0),
    expected: events.filter((e) => e.certainty === "forventet" && e.amount < 0).reduce((s, e) => s + e.amount, 0),
    income: events.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0),
  };
  return { start, series, events, lowest, totals };
}
