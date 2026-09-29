import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireCompany, can } from "@/server/auth";
import { PageHeader, Card, CardHeader, Badge, EmptyState, Tabs } from "@/components/ui";
import { ExpenseUpload } from "./expense-upload";
import { STATUS } from "@/lib/labels";
import { formatDate, formatMoney } from "@/lib/utils";
import { Receipt, AlertCircle } from "lucide-react";

export const metadata: Metadata = { title: "Udlæg" };

export default async function ExpensesPage(props: PageProps<"/app/expenses">) {
  const ctx = await requireCompany("submitExpenses");
  const sp = await props.searchParams;
  const showAll = sp.tab === "all" && can(ctx.role, "editInvoices");
  const rows = await ctx.db
    .select({ inv: schema.invoices, user: schema.users.name })
    .from(schema.invoices)
    .leftJoin(schema.users, eq(schema.users.id, schema.invoices.expenseUserId))
    .where(and(eq(schema.invoices.companyId, ctx.company.id), eq(schema.invoices.kind, "expense"), showAll ? undefined : eq(schema.invoices.expenseUserId, ctx.user.id)))
    .orderBy(desc(schema.invoices.createdAt))
    .limit(100);
  const properties = ctx.company.settings.propertyModule
    ? await ctx.db.select({ id: schema.properties.id, name: schema.properties.name }).from(schema.properties).where(eq(schema.properties.companyId, ctx.company.id))
    : [];
  const owed = rows.filter((r) => ["approved", "scheduled"].includes(r.inv.status) && r.inv.expenseUserId === ctx.user.id).reduce((s, r) => s + (r.inv.totalAmount ?? 0), 0);

  return (
    <div className="animate-in space-y-6">
      <PageHeader title="Udlæg" description="Tag et billede af kvitteringen – AI udfylder resten, og pengene refunderes til din konto, når udlægget er godkendt." />
      {!ctx.user.bankAccount ? (
        <div className="flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning-soft px-5 py-3 text-sm text-warning">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            Tilføj dit reg.- og kontonummer under{" "}
            <Link href="/app/settings/profile" className="font-medium underline">
              Min profil
            </Link>
            , så vi kan refundere dine udlæg.
          </span>
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <ExpenseUpload properties={properties} autoOpen={sp.new === "1"} />
          {owed ? (
            <Card className="mt-4 p-5">
              <p className="text-sm text-muted">Du får refunderet</p>
              <p className="text-2xl font-semibold tabular">{formatMoney(owed)}</p>
              <p className="text-xs text-muted">Godkendte udlæg, der er på vej til din konto</p>
            </Card>
          ) : null}
        </div>
        <div className="lg:col-span-2">
          {can(ctx.role, "editInvoices") ? (
            <Tabs
              active={showAll ? "all" : "mine"}
              items={[
                { key: "mine", label: "Mine udlæg", href: "/app/expenses" },
                { key: "all", label: "Alle medarbejdere", href: "/app/expenses?tab=all" },
              ]}
            />
          ) : null}
          <Card>
            <CardHeader title={showAll ? "Alle udlæg" : "Mine udlæg"} />
            {rows.length === 0 ? (
              <EmptyState icon={<Receipt className="h-6 w-6" />} title="Ingen udlæg endnu" description="Upload din første kvittering til venstre." />
            ) : (
              <ul className="divide-y divide-line">
                {rows.map(({ inv, user }) => (
                  <li key={inv.id}>
                    <Link href={`/app/invoices/${inv.id}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-surface-2">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                        <Receipt className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{inv.supplierName ?? "Kvittering"}</span>
                        <span className="text-xs text-muted">
                          {formatDate(inv.issueDate)}
                          {showAll && user ? ` · ${user}` : ""}
                          {inv.description ? ` · ${inv.description}` : ""}
                        </span>
                      </span>
                      <Badge tone={STATUS[inv.status].tone}>{inv.status === "paid" ? "Refunderet" : STATUS[inv.status].label}</Badge>
                      <span className="w-24 text-right font-medium tabular">{formatMoney(inv.totalAmount)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
