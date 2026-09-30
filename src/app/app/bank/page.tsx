import type { Metadata } from "next";
import { and, eq, inArray } from "drizzle-orm";
import { schema } from "@/db";
import { requireCompany, can } from "@/server/auth";
import { bankOverview } from "@/server/services/bank";
import { PageHeader, Card, CardHeader, Badge, Tabs } from "@/components/ui";
import { ConnectBank, SyncButton } from "./bank-controls";
import { TransactionList } from "./transaction-list";
import { DANISH_BANKS, liveBankConfigured } from "@/integrations/bank";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { formatIban } from "@/lib/banking";
import { Landmark, AlertCircle, CheckCircle2 } from "lucide-react";

export const metadata: Metadata = { title: "Bank & afstemning" };

export default async function BankPage(props: PageProps<"/app/bank">) {
  const ctx = await requireCompany();
  const sp = await props.searchParams;
  const tab = sp.tab === "all" ? "all" : "unmatched";
  const { accounts, connections, txs } = await bankOverview(ctx.db, ctx.company.id);
  const open = await ctx.db
    .select()
    .from(schema.invoices)
    .where(and(eq(schema.invoices.companyId, ctx.company.id), inArray(schema.invoices.status, ["approved", "scheduled", "pending_approval", "review"])));
  const invById = new Map(open.map((i) => [i.id, i]));
  const suggestedIds = txs.map((t) => t.matchedInvoiceId).filter((x): x is string => !!x && !invById.has(x));
  if (suggestedIds.length) {
    for (const i of await ctx.db.select().from(schema.invoices).where(inArray(schema.invoices.id, suggestedIds))) invById.set(i.id, i);
  }
  const unmatched = txs.filter((t) => t.status === "unmatched");
  const list = tab === "unmatched" ? unmatched : txs;

  return (
    <div className="animate-in space-y-6">
      <PageHeader
        title="Bank & afstemning"
        description="Konti og posteringer hentes via bank connect (PSD2). Fluks matcher automatisk betalinger med fakturaer."
        actions={
          <>
            {accounts.length ? <SyncButton /> : null}
            {can(ctx.role, "manageIntegrations") ? <ConnectBank banks={DANISH_BANKS.map((b) => ({ id: b.id, name: b.name, color: b.logoColor ?? "#333" }))} live={liveBankConfigured()} /> : null}
          </>
        }
      />
      {sp.connected === "1" ? (
        <div className="flex items-center gap-2 rounded-2xl border border-success/30 bg-success-soft px-5 py-3 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" /> Banken er forbundet. Konti og posteringer er hentet.
        </div>
      ) : sp.error ? (
        <div className="flex items-center gap-2 rounded-2xl border border-danger/30 bg-danger-soft px-5 py-3 text-sm text-danger">
          <AlertCircle className="h-4 w-4" /> Forbindelsen blev ikke gennemført: {String(sp.error)}
        </div>
      ) : null}

      {accounts.length === 0 ? (
        <Card className="flex flex-col items-center px-6 py-14 text-center">
          <span className="mb-3 rounded-2xl bg-brand-soft p-3 text-brand">
            <Landmark className="h-7 w-7" />
          </span>
          <h2 className="text-lg font-semibold">Forbind din bank på 1 minut</h2>
          <p className="mt-1 max-w-md text-sm text-muted">
            Log ind med MitID i din bank og giv Fluks adgang. Så betaler I fakturaer direkte fra Fluks, og alle betalinger afstemmes automatisk.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((a) => {
            const conn = connections.find((c) => c.id === a.connectionId);
            return (
              <Card key={a.id} className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted">{a.bankName}</p>
                    <p className="font-medium">{a.name}</p>
                  </div>
                  {conn ? (
                    <Badge tone={conn.status === "active" ? "success" : conn.status === "expired" ? "warning" : "danger"} dot>
                      {conn.status === "active" ? "Forbundet" : conn.status === "expired" ? "Samtykke udløbet" : "Fejl"}
                    </Badge>
                  ) : (
                    <Badge>Manuel</Badge>
                  )}
                </div>
                <p className="mt-4 text-2xl font-semibold tracking-tight tabular">{formatMoney(a.balance, a.currency)}</p>
                <p className="mt-1 font-mono text-xs text-muted">
                  {a.reg} {a.account} · {formatIban(a.iban)}
                </p>
                <p className="mt-2 text-xs text-muted">
                  Opdateret {formatDateTime(a.balanceAt)}
                  {conn?.consentExpiresAt ? ` · samtykke til ${conn.consentExpiresAt.toLocaleDateString("da-DK")}` : ""}
                </p>
              </Card>
            );
          })}
        </div>
      )}

      {accounts.length ? (
        <Card>
          <CardHeader title="Posteringer" description={unmatched.length ? `${unmatched.length} mangler afstemning` : "Alt er afstemt 🎉"} />
          <div className="px-5 pt-3">
            <Tabs
              active={tab}
              items={[
                { key: "unmatched", label: "Mangler afstemning", count: unmatched.length, href: "/app/bank" },
                { key: "all", label: "Alle", href: "/app/bank?tab=all" },
              ]}
            />
          </div>
          <TransactionList
            canMatch={can(ctx.role, "pay")}
            txs={list.map((t) => {
              const inv = t.matchedInvoiceId ? invById.get(t.matchedInvoiceId) : null;
              return {
                id: t.id,
                date: t.bookingDate,
                text: t.text,
                counterparty: t.counterparty,
                amount: t.amount,
                status: t.status,
                confidence: t.matchConfidence,
                paymentId: t.matchedPaymentId,
                invoice: inv ? { id: inv.id, supplier: inv.supplierName ?? "", number: inv.invoiceNumber, amount: inv.totalAmount } : null,
              };
            })}
            candidates={open.map((i) => ({ id: i.id, label: `${i.supplierName ?? "Ukendt"} · ${i.invoiceNumber ?? ""} · ${formatMoney(i.totalAmount)}`, amount: i.totalAmount ?? 0 }))}
          />
        </Card>
      ) : null}
    </div>
  );
}
