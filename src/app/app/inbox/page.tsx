import type { Metadata } from "next";
import { Mail, Network } from "lucide-react";
import { requireCompany } from "@/server/auth";
import { listInvoices, INBOX_TABS, type InboxTab } from "@/server/queries";
import { Card, PageHeader, Tabs } from "@/components/ui";
import { UploadZone } from "@/components/upload-zone";
import { InvoiceTable } from "@/components/invoice-table";
import { SearchBox } from "@/components/search-box";

export const metadata: Metadata = { title: "Indbakke" };

export default async function InboxPage(props: PageProps<"/app/inbox">) {
  const ctx = await requireCompany();
  const sp = await props.searchParams;
  const tab = (typeof sp.tab === "string" && sp.tab in INBOX_TABS ? sp.tab : "review") as InboxTab;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const { rows, tabCounts } = await listInvoices(ctx.db, ctx.company.id, { tab, q });
  const inboxAddress = `${ctx.company.slug}@indbakke.fluks.dk`;
  return (
    <div className="animate-in">
      <PageHeader
        title="Indbakke"
        description="Alle fakturaer og kreditnotaer samlet ét sted. AI aflæser, konterer og kontrollerer dem automatisk."
      />
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <UploadZone autoOpen={sp.upload === "1"} demo={ctx.company.isDemo} />
        </div>
        <Card className="flex flex-col justify-center gap-3 p-4 text-sm">
          <div className="flex items-start gap-3">
            <span className="rounded-lg bg-brand-soft p-2 text-brand">
              <Mail className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="font-medium">Videresend fakturaer på mail</p>
              <p className="truncate font-mono text-xs text-brand-ink" title={inboxAddress}>
                {inboxAddress}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="rounded-lg bg-brand-soft p-2 text-brand">
              <Network className="h-4 w-4" />
            </span>
            <div>
              <p className="font-medium">E-fakturaer via NemHandel</p>
              <p className="text-xs text-muted">{ctx.company.cvr ? `Modtages automatisk på CVR ${ctx.company.cvr}` : "Tilføj CVR under Indstillinger"}</p>
            </div>
          </div>
        </Card>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          active={tab}
          items={(Object.keys(INBOX_TABS) as InboxTab[]).map((k) => ({
            key: k,
            label: INBOX_TABS[k].label,
            count: tabCounts[k],
            href: `/app/inbox?tab=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
          }))}
        />
        <SearchBox placeholder="Søg leverandør, fakturanr. eller beløb" />
      </div>
      <InvoiceTable
        rows={rows.map(({ inv, property }) => ({
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
          property,
          flags: inv.flags.filter((f) => !f.dismissed).map((f) => ({ code: f.code, severity: f.severity, message: f.message })),
          confidence: inv.extraction?.confidence ? Math.min(...Object.values(inv.extraction.confidence).map((v) => v ?? 1)) : null,
          provider: inv.extraction?.provider ?? null,
        }))}
        tab={tab}
        canEdit={["owner", "admin", "accountant"].includes(ctx.role)}
      />
    </div>
  );
}
