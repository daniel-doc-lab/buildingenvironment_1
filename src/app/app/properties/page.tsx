import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, inArray, sql } from "drizzle-orm";
import { schema } from "@/db";
import { requireCompany, can } from "@/server/auth";
import { getIntegration } from "@/server/services/integrations";
import { PageHeader, Card, Badge, Progress, EmptyState } from "@/components/ui";
import { PropertyToolbar } from "./property-toolbar";
import { formatMoney, formatDateTime } from "@/lib/utils";
import { Building2, Home, MapPin } from "lucide-react";

export const metadata: Metadata = { title: "Ejendomme" };

export default async function PropertiesPage() {
  const ctx = await requireCompany();
  const year = new Date().getFullYear();
  const [props, units, spend, integ, open] = await Promise.all([
    ctx.db.select().from(schema.properties).where(eq(schema.properties.companyId, ctx.company.id)).orderBy(schema.properties.name),
    ctx.db
      .select({ propertyId: schema.units.propertyId, n: sql<number>`count(*)::int`, vacant: sql<number>`count(*) filter (where ${schema.units.tenantName} is null)::int` })
      .from(schema.units)
      .innerJoin(schema.properties, eq(schema.properties.id, schema.units.propertyId))
      .where(eq(schema.properties.companyId, ctx.company.id))
      .groupBy(schema.units.propertyId),
    ctx.db
      .select({ propertyId: sql<string>`coalesce(${schema.invoiceLines.propertyId}, ${schema.invoices.propertyId})`, sum: sql<number>`coalesce(sum(${schema.invoiceLines.amount}),0)::bigint` })
      .from(schema.invoiceLines)
      .innerJoin(schema.invoices, eq(schema.invoices.id, schema.invoiceLines.invoiceId))
      .where(
        and(
          eq(schema.invoices.companyId, ctx.company.id),
          inArray(schema.invoices.status, ["approved", "scheduled", "paid", "archived"]),
          sql`${schema.invoices.issueDate} >= ${`${year}-01-01`}`,
        ),
      )
      .groupBy(sql`1`),
    getIntegration(ctx.db, ctx.company.id, "boligflow"),
    ctx.db
      .select({ propertyId: schema.invoices.propertyId, n: sql<number>`count(*)::int` })
      .from(schema.invoices)
      .where(and(eq(schema.invoices.companyId, ctx.company.id), inArray(schema.invoices.status, ["review", "pending_approval"])))
      .groupBy(schema.invoices.propertyId),
  ]);
  const monthsElapsed = new Date().getMonth() + new Date().getDate() / 31;
  return (
    <div className="animate-in">
      <PageHeader
        title="Ejendomme"
        description={integ ? `Synkroniseret med Boligflow ${integ.lastSyncAt ? formatDateTime(integ.lastSyncAt) : ""}` : "Forbind Boligflow eller importér ejendomme fra CSV"}
        actions={can(ctx.role, "manageIntegrations") ? <PropertyToolbar connected={!!integ} /> : null}
      />
      {props.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Building2 className="h-6 w-6" />}
            title="Ingen ejendomme endnu"
            description="Forbind Boligflow under Integrationer, eller importér en CSV med ejendomme og lejemål. Derefter konterer AI automatisk fakturaer til den rigtige ejendom."
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {props.map((p) => {
            const used = Number(spend.find((s) => s.propertyId === p.id)?.sum ?? 0);
            const expectedShare = p.annualBudget ? (p.annualBudget * monthsElapsed) / 12 : null;
            const ratio = p.annualBudget ? used / p.annualBudget : 0;
            const u = units.find((x) => x.propertyId === p.id);
            const pending = open.find((o) => o.propertyId === p.id)?.n ?? 0;
            return (
              <Link key={p.id} href={`/app/properties/${p.id}`} className="block rounded-2xl border border-line bg-surface p-5 shadow-card transition hover:border-line-strong hover:shadow-pop">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{p.name}</p>
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted">
                      <MapPin className="h-3 w-3" /> {p.address ?? "Ingen adresse"}
                    </p>
                  </div>
                  {p.externalId?.startsWith("BF") ? <Badge tone="brand">Boligflow</Badge> : null}
                </div>
                <div className="mt-4 flex items-baseline justify-between">
                  <span className="text-xl font-semibold tabular">{formatMoney(used, "DKK", { compact: true })}</span>
                  <span className="text-xs text-muted">{p.annualBudget ? `af ${formatMoney(p.annualBudget, "DKK", { compact: true })} budget ${year}` : `udgifter ${year}`}</span>
                </div>
                {p.annualBudget ? (
                  <>
                    <Progress value={ratio} tone={expectedShare && used > expectedShare * 1.1 ? "danger" : expectedShare && used > expectedShare ? "warning" : "brand"} className="mt-2" />
                    <p className="mt-1.5 text-xs text-muted">
                      {Math.round(ratio * 100)} % brugt · {expectedShare && used > expectedShare ? `${formatMoney(used - expectedShare, "DKK", { compact: true })} over forventet forbrug` : "inden for budget"}
                    </p>
                  </>
                ) : null}
                <div className="mt-4 flex gap-4 border-t border-line pt-3 text-xs text-muted">
                  <span className="flex items-center gap-1">
                    <Home className="h-3.5 w-3.5" /> {u?.n ?? 0} lejemål{u?.vacant ? ` · ${u.vacant} ledige` : ""}
                  </span>
                  {pending ? <span className="text-warning">{pending} fakturaer afventer</span> : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
