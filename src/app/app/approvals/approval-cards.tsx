"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, ShieldAlert, AlertTriangle, FileText, PartyPopper, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, Textarea } from "@/components/ui";
import { decideAction, bulkApproveAction } from "../actions";
import { cn, dueLabel, formatMoney } from "@/lib/utils";

type Item = {
  id: string;
  supplier: string;
  number: string | null;
  kind: string;
  amount: number | null;
  currency: string;
  dueDate: string | null;
  description: string | null;
  fileId: string | null;
  flags: { severity: string; message: string }[];
  lines: { description: string; amount: number; account: string; property: string | null }[];
};

export function ApprovalCards({ items }: { items: Item[] }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const visible = items.filter((i) => !done.has(i.id));
  const clean = visible.filter((i) => i.flags.length === 0);

  function decide(id: string, d: "approve" | "reject", comment?: string) {
    start(async () => {
      const r = await decideAction(id, d, comment);
      if (!r.ok) return void toast.error(r.error);
      setDone((s) => new Set(s).add(id));
      setRejecting(null);
      setReason("");
      toast.success(d === "approve" ? "Godkendt – betaling planlagt" : "Afvist");
      router.refresh();
    });
  }

  if (!visible.length) {
    return (
      <Card className="flex flex-col items-center px-6 py-16 text-center">
        <span className="mb-3 rounded-2xl bg-success-soft p-3 text-success">
          <PartyPopper className="h-7 w-7" />
        </span>
        <h3 className="text-lg font-semibold">Du er helt ajour!</h3>
        <p className="mt-1 max-w-sm text-sm text-muted">Der er ikke flere fakturaer, der venter på dig. Vi giver besked på mail, når der kommer nye.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {clean.length > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand/20 bg-brand-soft/50 px-4 py-3">
          <p className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-brand" />
            <span>
              <strong>{clean.length}</strong> fakturaer uden advarsler på i alt <strong>{formatMoney(clean.reduce((s, i) => s + (i.amount ?? 0), 0))}</strong>
            </span>
          </p>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await bulkApproveAction(clean.map((c) => c.id));
                if (!r.ok) return void toast.error(r.error);
                setDone((s) => new Set([...s, ...clean.map((c) => c.id)]));
                toast.success(`${r.data!.approved} fakturaer godkendt`);
                router.refresh();
              })
            }
          >
            <Check className="h-4 w-4" /> Godkend alle {clean.length}
          </Button>
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {visible.map((i) => {
          const due = dueLabel(i.dueDate);
          const critical = i.flags.some((f) => f.severity === "critical");
          return (
            <Card key={i.id} className={cn("flex flex-col", critical && "border-danger/40")}>
              <div className="flex items-start justify-between gap-3 p-5 pb-3">
                <div className="min-w-0">
                  <Link href={`/app/invoices/${i.id}`} className="block truncate text-base font-semibold hover:underline">
                    {i.supplier}
                  </Link>
                  <p className="text-xs text-muted">
                    {i.kind === "expense" ? "Udlæg" : "Faktura"} {i.number ?? ""} ·{" "}
                    <span className={due.tone === "danger" ? "text-danger" : due.tone === "warning" ? "text-warning" : ""}>{due.text}</span>
                  </p>
                </div>
                <p className="shrink-0 text-xl font-semibold tabular">{formatMoney(i.amount, i.currency)}</p>
              </div>
              {i.description ? <p className="px-5 text-sm text-ink-2">{i.description}</p> : null}
              {i.flags.map((f) => (
                <p
                  key={f.message}
                  className={cn(
                    "mx-5 mt-2 flex gap-2 rounded-lg px-3 py-2 text-xs",
                    f.severity === "critical" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning",
                  )}
                >
                  {f.severity === "critical" ? <ShieldAlert className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
                  {f.message}
                </p>
              ))}
              <ul className="mx-5 mt-3 space-y-1 border-t border-line pt-3 text-xs">
                {i.lines.slice(0, 4).map((l, k) => (
                  <li key={k} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate text-muted">
                      {l.description} → <span className="text-ink-2">{l.account}</span>
                      {l.property ? <span className="text-muted"> · {l.property}</span> : null}
                    </span>
                    <span className="shrink-0 tabular">{formatMoney(l.amount)}</span>
                  </li>
                ))}
                {i.lines.length > 4 ? <li className="text-muted">+ {i.lines.length - 4} linjer</li> : null}
              </ul>
              <div className="mt-auto p-5 pt-4">
                {rejecting === i.id ? (
                  <div className="space-y-2">
                    <Textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Hvorfor afviser du? (sendes til bogholderen)" />
                    <div className="flex gap-2">
                      <Button variant="danger" size="sm" disabled={pending || !reason.trim()} onClick={() => decide(i.id, "reject", reason)}>
                        Afvis faktura
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setRejecting(null)}>
                        Fortryd
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="secondary" className="flex-1" disabled={pending} onClick={() => setRejecting(i.id)}>
                      <X className="h-4 w-4" /> Afvis
                    </Button>
                    <Link href={`/app/invoices/${i.id}`} className="inline-flex h-9 items-center justify-center rounded-[10px] border border-line px-3 text-muted hover:bg-surface-2" title="Se faktura">
                      <FileText className="h-4 w-4" />
                    </Link>
                    <Button className="flex-[2]" disabled={pending || critical} title={critical ? "Løs den kritiske advarsel først" : undefined} onClick={() => decide(i.id, "approve")}>
                      <Check className="h-4 w-4" /> Godkend
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
