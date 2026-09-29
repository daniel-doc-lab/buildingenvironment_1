import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireCompany, can } from "@/server/auth";
import { PageHeader, Card, CardHeader, Badge } from "@/components/ui";
import { BatchActions } from "./batch-actions";
import { BATCH_STATUS, PAYMENT_STATUS, METHOD_LABEL } from "@/lib/labels";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils";
import { ShieldCheck } from "lucide-react";

export const metadata: Metadata = { title: "Betalingsbatch" };

export default async function BatchPage(props: PageProps<"/app/payments/batches/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const ctx = await requireCompany();
  const batch = await ctx.db.query.paymentBatches.findFirst({ where: and(eq(schema.paymentBatches.id, id), eq(schema.paymentBatches.companyId, ctx.company.id)) });
  if (!batch) notFound();
  const [payments, account, people] = await Promise.all([
    ctx.db.select().from(schema.payments).where(eq(schema.payments.batchId, id)).orderBy(schema.payments.executionDate),
    batch.bankAccountId ? ctx.db.query.bankAccounts.findFirst({ where: eq(schema.bankAccounts.id, batch.bankAccountId) }) : Promise.resolve(undefined),
    ctx.db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users),
  ]);
  const name = (uid: string | null) => people.find((p) => p.id === uid)?.name ?? "–";
  const st = BATCH_STATUS[batch.status];
  const steps = [
    { label: "Oprettet", who: name(batch.createdBy), at: batch.createdAt, done: true },
    ...(batch.secondApproverId || batch.status === "awaiting_second_approval"
      ? [{ label: "2. godkendelse (4-øjne)", who: batch.secondApproverId ? name(batch.secondApproverId) : "afventer", at: null, done: !!batch.secondApproverId }]
      : []),
    batch.method === "file"
      ? { label: "Betalingsfil eksporteret", who: "", at: batch.submittedAt, done: ["exported", "completed"].includes(batch.status) }
      : { label: "Underskrevet med MitID", who: batch.signedBy ? name(batch.signedBy) : "", at: batch.submittedAt, done: ["submitted", "completed", "partially_failed"].includes(batch.status) },
    { label: "Gennemført", who: "", at: batch.completedAt, done: batch.status === "completed" },
  ];
  return (
    <div className="animate-in space-y-6">
      <PageHeader
        back={{ href: "/app/payments", label: "Betalinger" }}
        title={`Batch på ${formatMoney(batch.totalAmount)}`}
        description={`${batch.count} betalinger fra ${account ? `${account.bankName} · ${account.name} (${account.reg} ${account.account})` : "ukendt konto"}`}
        actions={<Badge tone={st?.tone}>{st?.label ?? batch.status}</Badge>}
      />
      {sp.signed === "1" ? (
        <div className="flex items-center gap-3 rounded-2xl border border-success/30 bg-success-soft px-5 py-4 text-sm text-success">
          <ShieldCheck className="h-5 w-5" /> Betalingerne er underskrevet og sendt til banken. De gennemføres på betalingsdatoen, og fakturaerne markeres automatisk som betalt ved afstemning.
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Betalinger" />
          <ul className="divide-y divide-line">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <Link href={p.invoiceId ? `/app/invoices/${p.invoiceId}` : "#"} className="font-medium hover:underline">
                    {p.creditorName}
                  </Link>
                  <p className="text-xs text-muted">
                    {METHOD_LABEL[p.method]} · {formatDate(p.executionDate)} · {p.message}
                  </p>
                  {p.error ? <p className="text-xs text-danger">{p.error}</p> : null}
                </div>
                <Badge tone={PAYMENT_STATUS[p.status]?.tone}>{PAYMENT_STATUS[p.status]?.label}</Badge>
                <span className="w-28 text-right font-medium tabular">{formatMoney(p.amount)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <div className="space-y-4">
          <Card className="p-5">
            <p className="mb-3 text-sm font-medium">Forløb</p>
            <ol className="space-y-3">
              {steps.map((s) => (
                <li key={s.label} className="flex items-start gap-3 text-sm">
                  <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${s.done ? "bg-success" : "bg-line-strong"}`} />
                  <span>
                    <span className={s.done ? "font-medium" : "text-muted"}>{s.label}</span>
                    {s.who || s.at ? (
                      <span className="block text-xs text-muted">
                        {s.who}
                        {s.at ? ` · ${formatDateTime(s.at)}` : ""}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
          <BatchActions
            batch={{ id: batch.id, status: batch.status, method: batch.method, fileId: batch.fileId, createdBy: batch.createdBy }}
            userId={ctx.user.id}
            canSign={can(ctx.role, "signPayments")}
            canPay={can(ctx.role, "pay")}
          />
        </div>
      </div>
    </div>
  );
}
