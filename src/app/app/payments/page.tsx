import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { schema } from "@/db";
import { requireCompany, can } from "@/server/auth";
import { PageHeader, Card, CardHeader, Badge, Stat, EmptyState } from "@/components/ui";
import { PaymentPlanner } from "./payment-planner";
import { BATCH_STATUS, METHOD_LABEL } from "@/lib/labels";
import { formatDateTime, formatMoney, todayISO } from "@/lib/utils";
import { Send, CalendarClock, CheckCircle2, Landmark } from "lucide-react";

export const metadata: Metadata = { title: "Betalinger" };

export default async function PaymentsPage() {
  const ctx = await requireCompany("view");
  const db = ctx.db;
  const [planned, batches, accounts, executedMonth, inFlight] = await Promise.all([
    db
      .select({ p: schema.payments, inv: schema.invoices })
      .from(schema.payments)
      .leftJoin(schema.invoices, eq(schema.invoices.id, schema.payments.invoiceId))
      .where(and(eq(schema.payments.companyId, ctx.company.id), eq(schema.payments.status, "planned")))
      .orderBy(schema.payments.executionDate),
    db
      .select({ b: schema.paymentBatches, creator: schema.users.name })
      .from(schema.paymentBatches)
      .leftJoin(schema.users, eq(schema.users.id, schema.paymentBatches.createdBy))
      .where(eq(schema.paymentBatches.companyId, ctx.company.id))
      .orderBy(desc(schema.paymentBatches.createdAt))
      .limit(25),
    db.select().from(schema.bankAccounts).where(eq(schema.bankAccounts.companyId, ctx.company.id)),
    db
      .select({ n: sql<number>`count(*)::int`, sum: sql<number>`coalesce(sum(${schema.payments.amount}),0)::bigint` })
      .from(schema.payments)
      .where(and(eq(schema.payments.companyId, ctx.company.id), eq(schema.payments.status, "executed"), sql`${schema.payments.executedAt} >= date_trunc('month', now())`)),
    db
      .select({ n: sql<number>`count(*)::int`, sum: sql<number>`coalesce(sum(${schema.payments.amount}),0)::bigint` })
      .from(schema.payments)
      .where(and(eq(schema.payments.companyId, ctx.company.id), inArray(schema.payments.status, ["in_batch", "submitted"]))),
  ]);
  const plannedSum = planned.reduce((s, r) => s + r.p.amount, 0);
  const today = todayISO();
  return (
    <div className="animate-in space-y-6">
      <PageHeader
        title="Betalinger"
        description="Godkendte fakturaer planlægges automatisk til forfaldsdagen. Saml dem i en batch og underskriv med MitID – eller hent en betalingsfil til netbanken."
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Klar til betaling" value={formatMoney(plannedSum, "DKK", { compact: true })} sub={`${planned.length} betalinger`} icon={<CalendarClock className="h-4 w-4" />} tone="brand" />
        <Stat label="Heraf forfalder i dag" value={String(planned.filter((p) => p.p.executionDate <= today).length)} sub="betalinger skal sendes i dag" icon={<Send className="h-4 w-4" />} tone="warning" />
        <Stat label="Sendt til bank" value={formatMoney(Number(inFlight[0]?.sum ?? 0), "DKK", { compact: true })} sub={`${inFlight[0]?.n ?? 0} betalinger undervejs`} icon={<Landmark className="h-4 w-4" />} tone="info" />
        <Stat label="Betalt denne måned" value={formatMoney(Number(executedMonth[0]?.sum ?? 0), "DKK", { compact: true })} sub={`${executedMonth[0]?.n ?? 0} betalinger`} icon={<CheckCircle2 className="h-4 w-4" />} tone="success" />
      </div>

      <PaymentPlanner
        canPay={can(ctx.role, "pay")}
        defaultAccountId={ctx.company.settings.defaultPaymentAccountId ?? accounts[0]?.id ?? null}
        accounts={accounts.map((a) => ({ id: a.id, label: `${a.bankName ?? ""} · ${a.name} (${a.reg} ${a.account})`, balance: a.balance }))}
        payments={planned.map(({ p, inv }) => ({
          id: p.id,
          invoiceId: p.invoiceId,
          creditor: p.creditorName,
          amount: p.amount,
          date: p.executionDate,
          dueDate: inv?.dueDate ?? null,
          method: METHOD_LABEL[p.method] ?? p.method,
          detail: p.method === "fik" ? `+${p.fikType}<${p.fikPaymentId ?? ""}+${p.fikCreditor}<` : p.method === "iban" ? p.iban ?? "" : `${p.bankReg ?? ""} ${p.bankAccount ?? ""}`,
          message: p.message,
          discount: !!(inv?.discountDate && inv.discountAmount === p.amount),
        }))}
      />

      <Card>
        <CardHeader title="Betalingsbatches" description="Historik over afsendte betalinger" />
        {batches.length === 0 ? (
          <EmptyState title="Ingen batches endnu" description="Når du sender betalinger til banken, dukker de op her." />
        ) : (
          <ul className="divide-y divide-line">
            {batches.map(({ b, creator }) => (
              <li key={b.id}>
                <Link href={`/app/payments/batches/${b.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm hover:bg-surface-2">
                  <Badge tone={BATCH_STATUS[b.status]?.tone}>{BATCH_STATUS[b.status]?.label ?? b.status}</Badge>
                  <span className="flex-1">
                    {b.count} betalinger · {b.method === "file" ? "Betalingsfil" : "Bank connect"} · oprettet af {creator ?? "–"}
                  </span>
                  <span className="text-xs text-muted">{formatDateTime(b.createdAt)}</span>
                  <span className="w-32 text-right font-medium tabular">{formatMoney(b.totalAmount)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
