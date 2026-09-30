"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, ShieldAlert, Info, Mail, Upload, Network, Smartphone, Building2, Sparkles, Inbox } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, EmptyState } from "@/components/ui";
import { STATUS, KIND_LABEL } from "@/lib/labels";
import { cn, dueLabel, formatDate, formatMoney } from "@/lib/utils";
import { bulkSubmitAction, bulkApproveAction, archiveWithoutPaymentAction } from "@/app/app/actions";
import type { InvoiceStatus } from "@/db/schema";

export type InvoiceRow = {
  id: string;
  supplierName: string | null;
  invoiceNumber: string | null;
  kind: string;
  source: string;
  status: string;
  totalAmount: number | null;
  currency: string;
  dueDate: string | null;
  issueDate: string | null;
  description: string | null;
  property: string | null;
  flags: { code: string; severity: "info" | "warning" | "critical"; message: string }[];
  confidence: number | null;
  provider: string | null;
};

const SOURCE_ICON: Record<string, typeof Mail> = { email: Mail, upload: Upload, nemhandel: Network, mobile: Smartphone, boligflow: Building2, demo: Sparkles };

export function InvoiceTable({ rows, tab, canEdit, mode = "inbox" }: { rows: InvoiceRow[]; tab?: string; canEdit: boolean; mode?: "inbox" | "approvals" }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const router = useRouter();
  const allSelected = rows.length > 0 && sel.size === rows.length;
  const toggle = (id: string) => setSel((s) => (s.has(id) ? (s.delete(id), new Set(s)) : new Set(s.add(id))));

  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-line bg-surface">
        <EmptyState
          icon={<Inbox className="h-6 w-6" />}
          title={mode === "approvals" ? "Intet venter på dig" : "Ingen bilag her"}
          description={mode === "approvals" ? "Du er helt ajour. Nye fakturaer dukker op her, når de er klar til din godkendelse." : "Upload en faktura eller videresend den til din indbakke-adresse."}
        />
      </div>
    );
  }

  const bulk = (fn: () => Promise<void>) => start(fn);
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      {canEdit && sel.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-brand-soft/50 px-4 py-2 text-sm">
          <span className="font-medium">{sel.size} valgt</span>
          <span className="flex-1" />
          {mode === "approvals" ? (
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                bulk(async () => {
                  const r = await bulkApproveAction([...sel]);
                  if (!r.ok) return void toast.error(r.error);
                  toast.success(`${r.data!.approved} godkendt${r.data!.failed ? ` · ${r.data!.failed} fejlede` : ""}`);
                  setSel(new Set());
                  router.refresh();
                })
              }
            >
              Godkend valgte
            </Button>
          ) : null}
          {mode === "inbox" && (tab === "review" || tab === "rejected") ? (
            <>
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  bulk(async () => {
                    const r = await bulkSubmitAction([...sel]);
                    if (!r.ok) return void toast.error(r.error);
                    if (r.data!.submitted) toast.success(`${r.data!.submitted} sendt til godkendelse`);
                    if (r.data!.errors.length) toast.error(`${r.data!.errors.length} kunne ikke sendes`, { description: r.data!.errors[0] });
                    setSel(new Set());
                    router.refresh();
                  })
                }
              >
                Send til godkendelse
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  bulk(async () => {
                    const r = await archiveWithoutPaymentAction([...sel]);
                    if (!r.ok) return void toast.error(r.error);
                    toast.success("Arkiveret");
                    setSel(new Set());
                    router.refresh();
                  })
                }
              >
                Arkivér uden betaling
              </Button>
            </>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>
            Ryd
          </Button>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              {canEdit ? (
                <th className="w-10 px-4 py-2.5">
                  <input type="checkbox" checked={allSelected} onChange={() => setSel(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} className="accent-[var(--brand)]" aria-label="Vælg alle" />
                </th>
              ) : null}
              <th className="px-4 py-2.5 font-medium">Leverandør</th>
              <th className="hidden px-4 py-2.5 font-medium md:table-cell">Fakturanr.</th>
              <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Ejendom</th>
              <th className="px-4 py-2.5 font-medium">Forfald</th>
              <th className="px-4 py-2.5 text-right font-medium">Beløb</th>
              <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const Icon = SOURCE_ICON[r.source] ?? Upload;
              const due = dueLabel(r.dueDate);
              const worst = r.flags.find((f) => f.severity === "critical") ?? r.flags.find((f) => f.severity === "warning");
              const st = STATUS[r.status as InvoiceStatus];
              const done = ["paid", "archived", "rejected"].includes(r.status);
              return (
                <tr key={r.id} className={cn("group border-b border-line last:border-0 hover:bg-surface-2/70", sel.has(r.id) && "bg-brand-soft/30")}>
                  {canEdit ? (
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} className="accent-[var(--brand)]" aria-label="Vælg" />
                    </td>
                  ) : null}
                  <td className="max-w-[320px] px-4 py-3">
                    <Link href={`/app/invoices/${r.id}`} className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted" title={r.source}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-medium text-ink group-hover:underline">{r.supplierName ?? "Ukendt leverandør"}</span>
                          {r.kind !== "invoice" ? <Badge tone={r.kind === "credit_note" ? "info" : "neutral"}>{KIND_LABEL[r.kind]}</Badge> : null}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {worst ? (
                            <span className={cn("inline-flex items-center gap-1", worst.severity === "critical" ? "text-danger" : "text-warning")}>
                              {worst.severity === "critical" ? <ShieldAlert className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                              {worst.message.split(".")[0]}
                            </span>
                          ) : (
                            r.description ?? (r.issueDate ? `Faktureret ${formatDate(r.issueDate)}` : "")
                          )}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 text-muted md:table-cell">{r.invoiceNumber ?? "–"}</td>
                  <td className="hidden max-w-[180px] truncate px-4 py-3 text-muted lg:table-cell">{r.property ?? "–"}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="block">{formatDate(r.dueDate, true)}</span>
                    {!done ? <span className={cn("text-xs", due.tone === "danger" ? "text-danger" : due.tone === "warning" ? "text-warning" : "text-muted")}>{due.text}</span> : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular">
                    {r.kind === "credit_note" ? "−" : ""}
                    {formatMoney(r.totalAmount, r.currency)}
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    <div className="flex items-center gap-1.5">
                      <Badge tone={st?.tone}>{st?.label ?? r.status}</Badge>
                      {r.confidence != null && r.confidence < 0.6 && !done ? (
                        <span title="AI er usikker på nogle felter">
                          <Info className="h-3.5 w-3.5 text-warning" />
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
