import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";
import { schema } from "@/db";
import { requireCompany, can } from "@/server/auth";
import { listInvoices } from "@/server/queries";
import { PageHeader, Card, CardHeader, Stat } from "@/components/ui";
import { BarList, ColumnChart } from "@/components/charts";
import { InvoiceTable } from "@/components/invoice-table";
import { PropertyForm } from "./property-form";
import { formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Ejendom" };

export default async function PropertyPage(props: PageProps<"/app/properties/[id]">) {
  const { id } = await props.params;
  const ctx = await requireCompany();
  const p = await ctx.db.query.properties.findFirst({ where: and(eq(schema.properties.id, id), eq(schema.properties.companyId, ctx.company.id)) });
  if (!p) notFound();
  const year = new Date().getFullYear();
  const lines = await ctx.db
    .select({ amount: schema.invoiceLines.amount, account: schema.invoiceLines.accountNumber, accountName: schema.accounts.name, unitId: sql<string | null>`coalesce(${schema.invoiceLines.unitId}, ${schema.invoices.unitId})`, issueDate: schema.invoices.issueDate, supplier: schema.invoices.supplierName })
    .from(schema.invoiceLines)
    .innerJoin(schema.invoices, eq(schema.invoices.id, schema.invoiceLines.invoiceId))
    .leftJoin(schema.accounts, and(eq(schema.accounts.companyId, ctx.company.id), eq(schema.accounts.number, schema.invoiceLines.accountNumber)))
    .where(
      and(
        eq(schema.invoices.companyId, ctx.company.id),
        sql`coalesce(${schema.invoiceLines.propertyId}, ${schema.invoices.propertyId}) = ${id}`,
        inArray(schema.invoices.status, ["approved", "scheduled", "paid", "archived"]),
      ),
    );
  const units = await ctx.db.select().from(schema.units).where(eq(schema.units.propertyId, id)).orderBy(schema.units.name);
  const thisYear = lines.filter((l) => l.issueDate?.startsWith(String(year)));
  const total = thisYear.reduce((s, l) => s + l.amount, 0);
  const byAccount = new Map<string, number>();
  for (const l of thisYear) byAccount.set(l.accountName ?? l.account ?? "Ukendt", (byAccount.get(l.accountName ?? l.account ?? "Ukendt") ?? 0) + l.amount);
  const bySupplier = new Map<string, number>();
  for (const l of thisYear) bySupplier.set(l.supplier ?? "Ukendt", (bySupplier.get(l.supplier ?? "Ukendt") ?? 0) + l.amount);
  const byMonth = new Map<string, number>();
  for (const l of lines) if (l.issueDate) byMonth.set(l.issueDate.slice(0, 7), (byMonth.get(l.issueDate.slice(0, 7)) ?? 0) + l.amount);
  const months = [...byMonth.entries()].sort().slice(-12).map(([m, v]) => ({ label: new Date(m + "-15").toLocaleDateString("da-DK", { month: "short" }), value: v }));
  const unitSpend = new Map<string, number>();
  for (const l of thisYear) if (l.unitId) unitSpend.set(l.unitId, (unitSpend.get(l.unitId) ?? 0) + l.amount);
  const area = units.reduce((s, u) => s + (u.areaM2 ?? 0), 0);
  const { rows } = await listInvoices(ctx.db, ctx.company.id, { tab: "all", propertyId: id, limit: 30 });

  return (
    <div className="animate-in space-y-6">
      <PageHeader back={{ href: "/app/properties", label: "Ejendomme" }} title={p.name} description={p.address ?? undefined} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Udgifter ${year}`} value={formatMoney(total, "DKK", { compact: true })} sub="ekskl. moms" />
        <Stat label="Budget" value={p.annualBudget ? formatMoney(p.annualBudget, "DKK", { compact: true }) : "–"} sub={p.annualBudget ? `${Math.round((total / p.annualBudget) * 100)} % brugt` : "Sæt et budget nedenfor"} />
        <Stat label="Pr. m²" value={area ? formatMoney(Math.round(total / area)) : "–"} sub={area ? `${area.toLocaleString("da-DK")} m² i alt` : undefined} />
        <Stat label="Lejemål" value={String(units.length)} sub={`${units.filter((u) => !u.tenantName).length} ledige`} />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Udgifter pr. måned" />
          <div className="p-4">{months.length ? <ColumnChart data={months} ariaLabel="Udgifter pr. måned" height={200} /> : <p className="py-8 text-center text-sm text-muted">Ingen udgifter endnu</p>}</div>
        </Card>
        <Card>
          <CardHeader title="Fordeling på konti" description={String(year)} />
          <div className="p-5">
            <BarList data={[...byAccount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label: label.replace(/^Ejendom: /, ""), value }))} />
          </div>
        </Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader title="Lejemål" description="Synkroniseret fra Boligflow" />
          <ul className="divide-y divide-line">
            {units.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span className="w-24 shrink-0 font-medium">{u.name}</span>
                <span className="min-w-0 flex-1 truncate text-muted">{u.tenantName ?? <span className="text-warning">Ledig</span>}</span>
                <span className="text-xs text-muted">{u.areaM2 ? `${u.areaM2} m²` : ""}</span>
                <span className="w-24 text-right tabular text-xs">{unitSpend.get(u.id) ? formatMoney(unitSpend.get(u.id)!) : ""}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Største leverandører" description={String(year)} />
          <div className="p-5">
            <BarList data={[...bySupplier.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value }))} />
          </div>
        </Card>
        <PropertyForm property={{ id: p.id, name: p.name, address: p.address, annualBudget: p.annualBudget, departmentCode: p.departmentCode }} canEdit={can(ctx.role, "editInvoices")} />
      </div>
      <div>
        <h2 className="mb-3 text-[15px] font-semibold">Fakturaer</h2>
        <InvoiceTable
          canEdit={false}
          rows={rows.map(({ inv }) => ({
            id: inv.id,
            supplierName: inv.supplierName,
            invoiceNumber: inv.invoiceNumber,
            kind: inv.kind,
            source: inv.source,
            status: inv.status,
            totalAmount: inv.totalAmount,
            currency: inv.currency,
            dueDate: inv.dueDate,
            issueDate: inv.issueDate,
            description: inv.description,
            property: null,
            flags: inv.flags.filter((f) => !f.dismissed),
            confidence: null,
            provider: null,
          }))}
        />
      </div>
    </div>
  );
}
