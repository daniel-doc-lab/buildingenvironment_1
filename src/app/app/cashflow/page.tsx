import type { Metadata } from "next";
import Link from "next/link";
import { requireCompany } from "@/server/auth";
import { forecast } from "@/server/services/cashflow";
import { PageHeader, Card, CardHeader, Stat, Badge, Tabs } from "@/components/ui";
import { BalanceChart } from "@/components/charts";
import { formatDate, formatMoney } from "@/lib/utils";
import { TrendingDown, TrendingUp, Wallet, AlertTriangle } from "lucide-react";

export const metadata: Metadata = { title: "Likviditet" };

export default async function CashflowPage(props: PageProps<"/app/cashflow">) {
  const ctx = await requireCompany();
  const sp = await props.searchParams;
  const days = [30, 60, 90].includes(Number(sp.days)) ? Number(sp.days) : 60;
  const f = await forecast(ctx.db, ctx.company.id, days);
  const eventsByDate: Record<string, string[]> = {};
  for (const e of f.events) (eventsByDate[e.date] ??= []).push(`${e.label} ${formatMoney(e.amount)}`);
  const end = f.series.at(-1)!.balance;
  const warn = f.lowest.balance < 0;
  return (
    <div className="animate-in space-y-6">
      <PageHeader title="Likviditet" description="Prognose baseret på banksaldo, planlagte betalinger, fakturaer under godkendelse og mønstre i jeres historik." />
      {warn ? (
        <div className="flex items-center gap-3 rounded-2xl border border-danger/30 bg-danger-soft px-5 py-3 text-sm text-danger">
          <AlertTriangle className="h-4 w-4" /> Saldoen forventes at gå i minus {formatDate(f.lowest.date)}. Overvej at udskyde betalinger eller flytte midler fra opsparingskontoen.
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Saldo i dag" value={formatMoney(f.start, "DKK", { compact: true })} icon={<Wallet className="h-4 w-4" />} tone="info" />
        <Stat label={`Laveste saldo (${days} dage)`} value={formatMoney(f.lowest.balance, "DKK", { compact: true })} sub={formatDate(f.lowest.date)} icon={<TrendingDown className="h-4 w-4" />} tone={warn ? "danger" : "warning"} />
        <Stat label={`Forventet om ${days} dage`} value={formatMoney(end, "DKK", { compact: true })} sub={`${end >= f.start ? "+" : ""}${formatMoney(end - f.start, "DKK", { compact: true })}`} icon={<TrendingUp className="h-4 w-4" />} tone="brand" />
        <Stat label="Udgående i perioden" value={formatMoney(-(f.totals.certain + f.totals.likely + f.totals.expected), "DKK", { compact: true })} sub={`Indgående ${formatMoney(f.totals.income, "DKK", { compact: true })}`} />
      </div>
      <Card>
        <CardHeader
          title="Forventet saldo"
          description="Alle konti i DKK. Hold musen over grafen for at se dagens bevægelser."
          action={
            <div>
              <Tabs
                active={String(days)}
                items={[30, 60, 90].map((d) => ({ key: String(d), label: `${d} dage`, href: `/app/cashflow?days=${d}` }))}
              />
            </div>
          }
        />
        <div className="p-4">
          <BalanceChart series={f.series} events={eventsByDate} height={300} ariaLabel="Forventet saldo" />
        </div>
      </Card>
      <Card>
        <CardHeader title="Bevægelser" description="Sikker = planlagt betaling · Sandsynlig = faktura under godkendelse · Forventet = mønster i historikken" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-5 py-2 font-medium">Dato</th>
                <th className="px-4 py-2 font-medium">Beskrivelse</th>
                <th className="px-4 py-2 font-medium">Sikkerhed</th>
                <th className="px-5 py-2 text-right font-medium">Beløb</th>
              </tr>
            </thead>
            <tbody>
              {f.events.map((e, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="whitespace-nowrap px-5 py-2.5 text-muted">{formatDate(e.date)}</td>
                  <td className="px-4 py-2.5">{e.href ? <Link href={e.href} className="hover:underline">{e.label}</Link> : e.label}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={e.certainty === "sikker" ? "brand" : e.certainty === "sandsynlig" ? "info" : "neutral"}>{e.certainty}</Badge>
                  </td>
                  <td className={`px-5 py-2.5 text-right font-medium tabular ${e.amount > 0 ? "text-success" : ""}`}>
                    {e.amount > 0 ? "+" : "−"}
                    {formatMoney(Math.abs(e.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
