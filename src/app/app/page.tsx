import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Inbox, Landmark, PenLine, Sparkles, Wallet, Zap, BadgePercent } from "lucide-react";
import { requireCompany } from "@/server/auth";
import { dashboardData } from "@/server/queries";
import { forecast } from "@/server/services/cashflow";
import { Card, CardHeader, Stat, Badge, LinkButton, Avatar } from "@/components/ui";
import { ColumnChart, BalanceChart } from "@/components/charts";
import { formatMoney, formatDate, formatDateTime } from "@/lib/utils";
import { AUDIT_LABEL, PAYMENT_STATUS } from "@/lib/labels";

export const metadata: Metadata = { title: "Overblik" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("da-DK", { hour: "numeric", timeZone: "Europe/Copenhagen" }).format(new Date()));
  return h < 10 ? "Godmorgen" : h < 17 ? "God dag" : "God aften";
}

export default async function Dashboard() {
  const ctx = await requireCompany();
  const d = await dashboardData(ctx.db, ctx.company.id, ctx.user.id);
  const f = await forecast(ctx.db, ctx.company.id, 45);
  const first = ctx.user.name.split(" ")[0];
  const months = d.monthly.map((m) => ({
    label: new Date(m.month + "-15").toLocaleDateString("da-DK", { month: "short" }),
    value: Number(m.sum),
    sub: `${m.n} fakturaer`,
  }));
  const reviewCount = d.review.length;
  const critical = d.flagged.filter((i) => i.flags.some((x) => x.severity === "critical" && !x.dismissed));
  const autoRate = d.autoStats.total ? Math.round((d.autoStats.auto / d.autoStats.total) * 100) : 0;

  const todos = [
    d.myPending.n > 0 && {
      href: "/app/approvals",
      icon: CheckCircle2,
      tone: "brand" as const,
      title: `${d.myPending.n} ${d.myPending.n === 1 ? "faktura venter" : "fakturaer venter"} på din godkendelse`,
      sub: formatMoney(Number(d.myPending.sum)),
    },
    critical.length > 0 && {
      href: `/app/invoices/${critical[0]!.id}`,
      icon: AlertTriangle,
      tone: "danger" as const,
      title: `${critical.length} ${critical.length === 1 ? "faktura" : "fakturaer"} med kritisk advarsel`,
      sub: critical[0]!.flags.find((x) => x.severity === "critical")!.message.split(".")[0],
    },
    reviewCount > 0 && {
      href: "/app/inbox?tab=review",
      icon: Inbox,
      tone: "warning" as const,
      title: `${reviewCount} ${reviewCount === 1 ? "bilag" : "bilag"} til gennemsyn i indbakken`,
      sub: "AI har aflæst og konteret – tjek og send videre",
    },
    d.batches.length > 0 && {
      href: `/app/payments/batches/${d.batches[0]!.id}`,
      icon: PenLine,
      tone: "info" as const,
      title: `${d.batches.length} betalingsbatch${d.batches.length === 1 ? "" : "es"} klar til underskrift`,
      sub: formatMoney(d.batches.reduce((s, b) => s + b.totalAmount, 0)),
    },
    d.planned.n > 0 && {
      href: "/app/payments",
      icon: Wallet,
      tone: "neutral" as const,
      title: `${d.planned.n} godkendte betalinger planlagt`,
      sub: `${formatMoney(Number(d.planned.sum))} – samles og underskrives med MitID`,
    },
    d.unmatched > 0 && {
      href: "/app/bank",
      icon: Landmark,
      tone: "neutral" as const,
      title: `${d.unmatched} bankpostering${d.unmatched === 1 ? "" : "er"} mangler afstemning`,
      sub: "AI har forslag klar",
    },
    d.discounts.length > 0 && {
      href: `/app/invoices/${d.discounts[0]!.id}`,
      icon: BadgePercent,
      tone: "success" as const,
      title: `Kontantrabat tilgængelig på ${d.discounts.length} faktura${d.discounts.length === 1 ? "" : "er"}`,
      sub: "Godkend i tide for at spare",
    },
  ].filter(Boolean) as { href: string; icon: typeof Inbox; tone: "brand" | "danger" | "warning" | "info" | "neutral" | "success"; title: string; sub: string }[];

  const toneBg = { brand: "bg-brand-soft text-brand", danger: "bg-danger-soft text-danger", warning: "bg-warning-soft text-warning", info: "bg-info-soft text-info", neutral: "bg-surface-2 text-ink-2", success: "bg-success-soft text-success" };
  const eventsByDate: Record<string, string[]> = {};
  for (const e of f.events) (eventsByDate[e.date] ??= []).push(`${e.label} ${formatMoney(e.amount)}`);

  return (
    <div className="animate-in space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted">{new Date().toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()}, {first}
          </h1>
        </div>
        <div className="flex gap-2">
          <LinkButton href="/app/inbox?upload=1" variant="secondary">
            Upload faktura
          </LinkButton>
          {d.myPending.n > 0 ? <LinkButton href="/app/approvals">Godkend ({d.myPending.n})</LinkButton> : null}
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line bg-gradient-to-r from-brand-soft/70 to-transparent px-5 py-3">
          <Sparkles className="h-4 w-4 text-brand" />
          <p className="text-sm font-medium">Det skal du tage dig af i dag</p>
        </div>
        {todos.length === 0 ? (
          <div className="flex items-center gap-3 px-5 py-6 text-sm text-muted">
            <CheckCircle2 className="h-5 w-5 text-success" /> Alt er under kontrol. Fluks betaler de godkendte fakturaer til tiden.
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {todos.map((t) => (
              <li key={t.title}>
                <Link href={t.href} className="group flex items-center gap-3 px-5 py-3 transition hover:bg-surface-2">
                  <span className={`rounded-xl p-2 ${toneBg[t.tone]}`}>
                    <t.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{t.title}</span>
                    <span className="block truncate text-xs text-muted">{t.sub}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-ink" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Til din godkendelse" value={formatMoney(Number(d.myPending.sum), "DKK", { compact: true })} sub={`${d.myPending.n} fakturaer`} href="/app/approvals" icon={<CheckCircle2 className="h-4 w-4" />} tone="brand" />
        <Stat label="Forfalder inden 7 dage" value={formatMoney(Number(d.dueSoon.sum), "DKK", { compact: true })} sub={`${d.dueSoon.n} fakturaer`} href="/app/payments" icon={<Clock className="h-4 w-4" />} tone="warning" />
        <Stat label="Banksaldo" value={formatMoney(d.balance, "DKK", { compact: true })} sub={`Laveste om 45 dage: ${formatMoney(f.lowest.balance, "DKK", { compact: true })}`} href="/app/cashflow" icon={<Landmark className="h-4 w-4" />} tone="info" />
        <Stat
          label="Automatiseret (30 dage)"
          value={`${autoRate} %`}
          sub={`${d.autoStats.auto} af ${d.autoStats.total} bilag gik direkte igennem`}
          icon={<Zap className="h-4 w-4" />}
          tone="success"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Udgifter pr. måned" description="Ekskl. moms, godkendte og betalte fakturaer" action={<LinkButton href="/app/reports" variant="ghost" size="sm">Rapporter →</LinkButton>} />
          <div className="p-4">
            {months.length ? <ColumnChart data={months} ariaLabel="Udgifter pr. måned" /> : <p className="py-10 text-center text-sm text-muted">Ingen data endnu</p>}
          </div>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Likviditet næste 45 dage" description="Saldo inkl. planlagte og forventede betalinger" action={<LinkButton href="/app/cashflow" variant="ghost" size="sm">Detaljer →</LinkButton>} />
          <div className="p-4">
            <BalanceChart series={f.series} events={eventsByDate} height={230} ariaLabel="Forventet saldo" />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Kommende betalinger" action={<LinkButton href="/app/payments" variant="ghost" size="sm">Alle →</LinkButton>} />
          {d.upcoming.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">Ingen planlagte betalinger</p>
          ) : (
            <ul className="divide-y divide-line">
              {d.upcoming.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-12 shrink-0 text-center">
                    <div className="text-lg font-semibold leading-none tabular">{p.executionDate.slice(8, 10)}</div>
                    <div className="text-[11px] uppercase text-muted">{new Date(p.executionDate + "T12:00:00").toLocaleDateString("da-DK", { month: "short" })}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link href={p.invoiceId ? `/app/invoices/${p.invoiceId}` : "/app/payments"} className="block truncate text-sm font-medium hover:underline">
                      {p.creditorName}
                    </Link>
                    <p className="text-xs text-muted">{p.message}</p>
                  </div>
                  <span className="hidden sm:inline-flex"><Badge tone={PAYMENT_STATUS[p.status]?.tone}>{PAYMENT_STATUS[p.status]?.label}</Badge></span>
                  <span className="shrink-0 text-right text-sm font-medium tabular sm:w-28">{formatMoney(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Seneste aktivitet" />
          <ul className="divide-y divide-line">
            {d.activity.map(({ log, user, supplier }) => (
              <li key={log.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                {user ? <Avatar name={user} /> : <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-brand"><Sparkles className="h-3.5 w-3.5" /></span>}
                <p className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{user ?? "Fluks"}</span> <span className="text-muted">{AUDIT_LABEL[log.action] ?? log.action}</span>{" "}
                  {log.entityType === "invoice" && log.entityId ? (
                    <Link href={`/app/invoices/${log.entityId}`} className="font-medium hover:underline">
                      {supplier ?? "faktura"}
                    </Link>
                  ) : (
                    <span>{log.entityType === "payment_batch" ? "betalingsbatch" : log.entityType}</span>
                  )}
                </p>
                <span className="hidden shrink-0 text-xs text-muted sm:inline">{formatDateTime(log.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <p className="text-center text-xs text-muted">
        Opdateret {formatDate(new Date())} · Data fra bank og regnskab synkroniseres automatisk
      </p>
    </div>
  );
}
