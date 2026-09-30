import type { Metadata } from "next";
import Link from "next/link";
import { eq, ilike, and } from "drizzle-orm";
import { schema } from "@/db";
import { requireCompany, can } from "@/server/auth";
import { supplierStats } from "@/server/services/suppliers";
import { PageHeader, Card, Badge, LinkButton, EmptyState } from "@/components/ui";
import { SearchBox } from "@/components/search-box";
import { formatDate, formatMoney } from "@/lib/utils";
import { ShieldCheck, Plus, Users } from "lucide-react";

export const metadata: Metadata = { title: "Leverandører" };

export default async function SuppliersPage(props: PageProps<"/app/suppliers">) {
  const ctx = await requireCompany();
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const [suppliers, stats] = await Promise.all([
    ctx.db
      .select()
      .from(schema.suppliers)
      .where(and(eq(schema.suppliers.companyId, ctx.company.id), q ? ilike(schema.suppliers.name, `%${q}%`) : undefined))
      .orderBy(schema.suppliers.name),
    supplierStats(ctx.db, ctx.company.id),
  ]);
  const rows = suppliers
    .map((s) => ({ s, st: stats.find((x) => x.supplierId === s.id) }))
    .sort((a, b) => Number(b.st?.total ?? 0) - Number(a.st?.total ?? 0));
  return (
    <div className="animate-in">
      <PageHeader
        title="Leverandører"
        description="Oprettes automatisk fra fakturaer og beriges med data fra CVR-registret."
        actions={
          can(ctx.role, "editInvoices") ? (
            <LinkButton href="/app/suppliers/new">
              <Plus className="h-4 w-4" /> Ny leverandør
            </LinkButton>
          ) : null
        }
      />
      <div className="flex justify-end">
        <SearchBox placeholder="Søg leverandør" />
      </div>
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={<Users className="h-6 w-6" />} title="Ingen leverandører endnu" description="Leverandører oprettes automatisk, når du uploader den første faktura." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-5 py-2.5 font-medium">Leverandør</th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">CVR</th>
                  <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Betaling</th>
                  <th className="px-4 py-2.5 text-right font-medium">Fakturaer</th>
                  <th className="px-4 py-2.5 text-right font-medium">Samlet</th>
                  <th className="hidden px-5 py-2.5 font-medium sm:table-cell">Seneste</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ s, st }) => (
                  <tr key={s.id} className="border-b border-line last:border-0 hover:bg-surface-2/60">
                    <td className="px-5 py-3">
                      <Link href={`/app/suppliers/${s.id}`} className="font-medium hover:underline">
                        {s.name}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        {s.industry ? <span className="truncate">{s.industry}</span> : null}
                        {s.trusted ? (
                          <Badge tone="success">
                            <ShieldCheck className="h-3 w-3" /> Betroet
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 font-mono text-xs text-muted md:table-cell">{s.cvr ?? "–"}</td>
                    <td className="hidden px-4 py-3 font-mono text-xs text-muted lg:table-cell">
                      {s.fiCreditor ? `FI +71 ${s.fiCreditor}` : s.bankAccount ? `${s.bankReg} ${s.bankAccount}` : s.iban ?? "–"}
                    </td>
                    <td className="px-4 py-3 text-right tabular">{st?.count ?? 0}</td>
                    <td className="px-4 py-3 text-right font-medium tabular">{formatMoney(Number(st?.total ?? 0), "DKK", { compact: true })}</td>
                    <td className="hidden px-5 py-3 text-muted sm:table-cell">{formatDate(st?.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
