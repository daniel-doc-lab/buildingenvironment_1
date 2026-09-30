import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireCompany, can } from "@/server/auth";
import { PageHeader, Card, CardHeader, Badge, Stat } from "@/components/ui";
import { SupplierForm } from "./supplier-form";
import { InvoiceTable } from "@/components/invoice-table";
import { ColumnChart } from "@/components/charts";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { ShieldCheck, ShieldAlert } from "lucide-react";

export const metadata: Metadata = { title: "Leverandør" };

export default async function SupplierPage(props: PageProps<"/app/suppliers/[id]">) {
  const { id } = await props.params;
  const ctx = await requireCompany();
  const isNew = id === "new";
  const supplier = isNew ? null : await ctx.db.query.suppliers.findFirst({ where: and(eq(schema.suppliers.id, id), eq(schema.suppliers.companyId, ctx.company.id)) });
  if (!isNew && !supplier) notFound();
  const [accounts, vatCodes, properties, invoices, rules] = await Promise.all([
    ctx.db.select().from(schema.accounts).where(and(eq(schema.accounts.companyId, ctx.company.id), eq(schema.accounts.type, "expense"))).orderBy(schema.accounts.number),
    ctx.db.select().from(schema.vatCodes).where(eq(schema.vatCodes.companyId, ctx.company.id)),
    ctx.db.select().from(schema.properties).where(eq(schema.properties.companyId, ctx.company.id)),
    isNew ? Promise.resolve([]) : ctx.db.select().from(schema.invoices).where(eq(schema.invoices.supplierId, id)).orderBy(desc(schema.invoices.issueDate)).limit(50),
    isNew ? Promise.resolve([]) : ctx.db.select().from(schema.codingRules).where(eq(schema.codingRules.supplierId, id)),
  ]);
  const byMonth = new Map<string, number>();
  for (const i of invoices) if (i.issueDate && i.status !== "rejected") byMonth.set(i.issueDate.slice(0, 7), (byMonth.get(i.issueDate.slice(0, 7)) ?? 0) + (i.amountExVat ?? 0));
  const months = [...byMonth.entries()].sort().slice(-12).map(([m, v]) => ({ label: new Date(m + "-15").toLocaleDateString("da-DK", { month: "short" }), value: v }));
  const total = invoices.filter((i) => i.status !== "rejected").reduce((s, i) => s + (i.totalAmount ?? 0), 0);

  return (
    <div className="animate-in space-y-6">
      <PageHeader
        back={{ href: "/app/suppliers", label: "Leverandører" }}
        title={supplier?.name ?? "Ny leverandør"}
        description={supplier ? [supplier.cvr ? `CVR ${supplier.cvr}` : null, supplier.industry, supplier.address].filter(Boolean).join(" · ") : "Indtast CVR – så henter vi resten"}
        actions={
          supplier ? (
            supplier.trusted ? (
              <Badge tone="success">
                <ShieldCheck className="h-3.5 w-3.5" /> Betroet leverandør
              </Badge>
            ) : null
          ) : null
        }
      />
      {supplier ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Fakturaer" value={String(invoices.length)} />
          <Stat label="Samlet (inkl. moms)" value={formatMoney(total, "DKK", { compact: true })} />
          <Stat label="Gns. pr. faktura" value={formatMoney(invoices.length ? Math.round(total / invoices.length) : 0, "DKK", { compact: true })} />
          <Stat
            label="Betalingsoplysninger"
            value={supplier.bankChangedAt && (!supplier.bankVerifiedAt || supplier.bankVerifiedAt < supplier.bankChangedAt) ? "Ændret" : "Bekræftet"}
            sub={supplier.bankVerifiedAt ? `Bekræftet ${formatDateTime(supplier.bankVerifiedAt)}` : "Ikke bekræftet"}
            icon={supplier.bankChangedAt && (!supplier.bankVerifiedAt || supplier.bankVerifiedAt < supplier.bankChangedAt) ? <ShieldAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            tone={supplier.bankChangedAt && (!supplier.bankVerifiedAt || supplier.bankVerifiedAt < supplier.bankChangedAt) ? "danger" : "success"}
          />
        </div>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-2">
          <SupplierForm
            supplier={supplier ?? null}
            canEdit={can(ctx.role, "editInvoices")}
            accounts={accounts.map((a) => ({ value: a.number, label: `${a.number} ${a.name}` }))}
            vatCodes={vatCodes.map((v) => ({ value: v.code, label: `${v.code} – ${v.name}` }))}
            properties={properties.map((p) => ({ value: p.id, label: p.name }))}
            rules={rules.map((r) => ({ name: r.name, source: r.source, hits: r.hits }))}
          />
        </div>
        {supplier ? (
          <div className="space-y-6 xl:col-span-3">
            <Card>
              <CardHeader title="Udgifter pr. måned" description="Ekskl. moms" />
              <div className="p-4">{months.length ? <ColumnChart data={months} ariaLabel="Udgifter pr. måned" height={200} /> : <p className="py-8 text-center text-sm text-muted">Ingen data</p>}</div>
            </Card>
            <InvoiceTable
              canEdit={false}
              rows={invoices.map((inv) => ({
                id: inv.id,
                supplierName: inv.invoiceNumber ? `Faktura ${inv.invoiceNumber}` : "Faktura",
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
        ) : null}
      </div>
    </div>
  );
}
