import type { Metadata } from "next";
import Link from "next/link";
import { requireCompany, can } from "@/server/auth";
import { approvalQueue, linesForInvoices } from "@/server/queries";
import { PageHeader, Tabs, Badge, Card, EmptyState, Avatar } from "@/components/ui";
import { ApprovalCards } from "./approval-cards";
import { STATUS } from "@/lib/labels";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";

export const metadata: Metadata = { title: "Godkendelser" };

export default async function ApprovalsPage(props: PageProps<"/app/approvals">) {
  const ctx = await requireCompany();
  const sp = await props.searchParams;
  const tab = sp.tab === "all" && can(ctx.role, "editInvoices") ? "all" : sp.tab === "history" ? "history" : "mine";
  const [mine, all] = await Promise.all([approvalQueue(ctx.db, ctx.company.id, ctx.user.id, "mine"), can(ctx.role, "editInvoices") ? approvalQueue(ctx.db, ctx.company.id, ctx.user.id, "all") : Promise.resolve([])]);
  const rows = tab === "mine" ? mine : tab === "all" ? all : await approvalQueue(ctx.db, ctx.company.id, ctx.user.id, "history");
  const ids = [...new Set(rows.map((r) => r.inv.id))];
  const lines = await linesForInvoices(ctx.db, ctx.company.id, ids);

  return (
    <div className="animate-in">
      <PageHeader title="Godkendelser" description="Godkend med ét klik – også fra mobilen. Betalingen planlægges automatisk til forfaldsdagen." />
      <Tabs
        active={tab}
        items={[
          { key: "mine", label: "Venter på mig", count: mine.length, href: "/app/approvals" },
          ...(can(ctx.role, "editInvoices") ? [{ key: "all", label: "Alle afventende", count: new Set(all.map((a) => a.inv.id)).size, href: "/app/approvals?tab=all" }] : []),
          { key: "history", label: "Mine beslutninger", href: "/app/approvals?tab=history" },
        ]}
      />
      {tab === "mine" ? (
        <ApprovalCards
          items={mine.map(({ inv }) => ({
            id: inv.id,
            supplier: inv.supplierName ?? "Ukendt",
            number: inv.invoiceNumber,
            kind: inv.kind,
            amount: inv.totalAmount,
            currency: inv.currency,
            dueDate: inv.dueDate,
            description: inv.description,
            fileId: inv.fileId,
            flags: inv.flags.filter((f) => !f.dismissed && f.severity !== "info").map((f) => ({ severity: f.severity, message: f.message })),
            lines: lines
              .filter((l) => l.l.invoiceId === inv.id)
              .map((l) => ({ description: l.l.description, amount: l.l.amount, account: l.l.accountNumber ? `${l.l.accountNumber} ${l.accountName ?? ""}` : "Ikke konteret", property: l.property })),
          }))}
        />
      ) : tab === "all" ? (
        rows.length === 0 ? (
          <Card>
            <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title="Ingen afventende godkendelser" />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-line">
              {rows.map(({ a, inv, name }) => (
                <li key={a.id}>
                  <Link href={`/app/invoices/${inv.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm hover:bg-surface-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{inv.supplierName}</span>
                      <span className="text-xs text-muted">
                        {a.stepName} · forfalder {formatDate(inv.dueDate)} · venter siden {formatDateTime(a.createdAt)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted">
                      <Avatar name={name} className="h-6 w-6 text-[10px]" /> {name}
                    </span>
                    <span className="w-28 text-right font-medium tabular">{formatMoney(inv.totalAmount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )
      ) : (
        <Card className="overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState title="Ingen beslutninger endnu" />
          ) : (
            <ul className="divide-y divide-line">
              {rows.map(({ a, inv }) => (
                <li key={a.id}>
                  <Link href={`/app/invoices/${inv.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm hover:bg-surface-2">
                    <Badge tone={a.status === "approved" ? "success" : "danger"}>{a.status === "approved" ? "Godkendt" : "Afvist"}</Badge>
                    <span className="min-w-0 flex-1 truncate font-medium">{inv.supplierName}</span>
                    <span className="text-xs text-muted">{formatDateTime(a.decidedAt)}</span>
                    <Badge tone={STATUS[inv.status].tone}>{STATUS[inv.status].label}</Badge>
                    <span className="w-28 text-right tabular">{formatMoney(inv.totalAmount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
