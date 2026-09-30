import type { Metadata } from "next";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { schema } from "@/db";
import { requireCompany } from "@/server/auth";
import { PageHeader, Card, CardHeader, Stat, Tabs, LinkButton } from "@/components/ui";
import { BarList, ColumnChart } from "@/components/charts";
import { formatMoney, todayISO } from "@/lib/utils";
import { Download, Timer, Target, Sparkles, CalendarCheck } from "lucide-react";

export const metadata: Metadata = { title: "Rapporter" };

export default async function ReportsPage(props: PageProps<"/app/reports">) {
  const ctx = await requireCompany();
  const sp = await props.searchParams;
  const year = new Date().getFullYear();
  const period = sp.period === "ytd" ? "ytd" : sp.period === "last" ? "last" : "12m";
  const to = period === "last" ? `${year - 1}-12-31` : todayISO();
  const from = period === "ytd" ? `${year}-01-01` : period === "last" ? `${year - 1}-01-01` : (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  })();

  const lines = await ctx.db
    .select({
      amount: schema.invoiceLines.amount,
      account: schema.invoiceLines.accountNumber,
      accountName: schema.accounts.name,
      supplier: schema.invoices.supplierName,
      supplierId: schema.invoices.supplierId,
      property: schema.properties.name,
      propertyId: schema.properties.id,
      budget: schema.properties.annualBudget,
      issueDate: schema.invoices.issueDate,
      aiSuggested: schema.invoiceLines.aiSuggested,
      aiReason: schema.invoiceLines.aiReason,
    })
    .from(schema.invoiceLines)
    .innerJoin(schema.invoices, eq(schema.invoices.id, schema.invoiceLines.invoiceId))
    .leftJoin(schema.accounts, and(eq(schema.accounts.companyId, ctx.company.id), eq(schema.accounts.number, schema.invoiceLines.accountNumber)))
    .leftJoin(schema.properties, eq(schema.properties.id, sql`coalesce(${schema.invoiceLines.propertyId}, ${schema.invoices.propertyId})`))
    .where(
      and(
        eq(schema.invoices.companyId, ctx.company.id),
        inArray(schema.invoices.status, ["approved", "scheduled", "paid", "archived"]),
        gte(schema.invoices.issueDate, from),
        lte(schema.invoices.issueDate, to),
      ),
    );
  const group = <K extends string>(key: (l: (typeof lines)[number]) => K | null) => {
    const m = new Map<K, number>();
    for (const l of lines) {
      const k = key(l);
      if (k) m.set(k, (m.get(k) ?? 0) + l.amount);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const months = group((l) => l.issueDate?.slice(0, 7) ?? null).sort((a, b) => a[0].localeCompare(b[0]));
  const suppliers = group((l) => l.supplier);
  const accounts = group((l) => (l.account ? `${l.account} ${l.accountName ?? ""}` : null));
  const propertyRows = group((l) => l.property);
  const budgets = new Map(lines.filter((l) => l.property).map((l) => [l.property!, l.budget]));

  const [proc] = await ctx.db
    .select({
      avgHours: sql<number>`coalesce(avg(extract(epoch from (a.decided - ${schema.invoices.createdAt})) / 3600), 0)::float`,
      onTime: sql<number>`count(*) filter (where ${schema.invoices.paidAt}::date <= ${schema.invoices.dueDate})::int`,
      paid: sql<number>`count(*) filter (where ${schema.invoices.paidAt} is not null)::int`,
    })
    .from(schema.invoices)
    .leftJoin(
      sql`(select invoice_id, max(decided_at) as decided from ${schema.approvals} where status = 'approved' group by invoice_id) a`,
      sql`a.invoice_id = ${schema.invoices.id}`,
    )
    .where(and(eq(schema.invoices.companyId, ctx.company.id), gte(schema.invoices.issueDate, from)));
  const aiLines = lines.filter((l) => l.aiReason);
  const aiKept = aiLines.filter((l) => l.aiSuggested).length;

  return (
    <div className="animate-in space-y-6">
      <PageHeader
        title="Rapporter"
        description="Udgifter ekskl. moms fra godkendte og betalte fakturaer."
        actions={
          <>
            <LinkButton href={`/api/export?type=invoices&from=${from}&to=${to}`} variant="secondary" prefetch={false}>
              <Download className="h-4 w-4" /> Fakturaer (CSV)
            </LinkButton>
            <LinkButton href={`/api/export?type=lines&from=${from}&to=${to}`} variant="secondary" prefetch={false}>
              <Download className="h-4 w-4" /> Kontering (CSV)
            </LinkButton>
          </>
        }
      />
      <Tabs
        active={period}
        items={[
          { key: "12m", label: "Seneste 12 måneder", href: "/app/reports" },
          { key: "ytd", label: `År til dato ${year}`, href: "/app/reports?period=ytd" },
          { key: "last", label: String(year - 1), href: "/app/reports?period=last" },
        ]}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Udgifter i alt" value={formatMoney(total, "DKK", { compact: true })} sub={`${suppliers.length} leverandører`} icon={<Target className="h-4 w-4" />} tone="brand" />
        <Stat label="Gns. tid til godkendelse" value={`${proc?.avgHours ? (proc.avgHours < 24 ? `${Math.round(proc.avgHours)} t` : `${(proc.avgHours / 24).toFixed(1)} d`) : "–"}`} sub="fra modtagelse til godkendt" icon={<Timer className="h-4 w-4" />} tone="info" />
        <Stat label="Betalt til tiden" value={proc?.paid ? `${Math.round((proc.onTime / proc.paid) * 100)} %` : "–"} sub={`${proc?.onTime ?? 0} af ${proc?.paid ?? 0} betalinger`} icon={<CalendarCheck className="h-4 w-4" />} tone="success" />
        <Stat label="AI-kontering accepteret" value={aiLines.length ? `${Math.round((aiKept / aiLines.length) * 100)} %` : "–"} sub={`${aiKept} af ${aiLines.length} linjer uden rettelser`} icon={<Sparkles className="h-4 w-4" />} tone="warning" />
      </div>
      <Card>
        <CardHeader title="Udgifter pr. måned" />
        <div className="p-4">
          <ColumnChart data={months.map(([m, v]) => ({ label: new Date(m + "-15").toLocaleDateString("da-DK", { month: "short", year: "2-digit" }), value: v }))} ariaLabel="Udgifter pr. måned" height={240} highlightLast={false} />
        </div>
      </Card>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader title="Største leverandører" />
          <div className="p-5">
            <BarList data={suppliers.slice(0, 10).map(([label, value]) => ({ label, value, sub: `${Math.round((value / (total || 1)) * 100)} % af total` }))} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Konti" />
          <div className="p-5">
            <BarList data={accounts.slice(0, 10).map(([label, value]) => ({ label, value }))} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Ejendomme" description="Streg = årsbudget" />
          <div className="p-5">
            {propertyRows.length ? (
              <BarList budget data={propertyRows.map(([label, value]) => ({ label, value, budget: budgets.get(label) ?? null }))} />
            ) : (
              <p className="text-sm text-muted">Ingen udgifter fordelt på ejendomme</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
