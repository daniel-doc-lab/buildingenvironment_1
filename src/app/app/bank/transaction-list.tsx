"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Check, EyeOff, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Select, EmptyState } from "@/components/ui";
import { matchTransactionAction, ignoreTransactionAction } from "./actions";
import { formatDate, formatMoney } from "@/lib/utils";

type Tx = {
  id: string;
  date: string;
  text: string;
  counterparty: string | null;
  amount: number;
  status: string;
  confidence: number | null;
  paymentId: string | null;
  invoice: { id: string; supplier: string; number: string | null; amount: number | null } | null;
};

export function TransactionList({ txs, candidates, canMatch }: { txs: Tx[]; candidates: { id: string; label: string; amount: number }[]; canMatch: boolean }) {
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      if (r.message) toast.success(r.message);
      router.refresh();
    });
  if (!txs.length) return <EmptyState title="Ingen posteringer" description="Alle posteringer er afstemt." />;
  return (
    <ul className="divide-y divide-line">
      {txs.map((t) => {
        const out = t.amount < 0;
        const sameAmount = candidates.filter((c) => c.amount === Math.abs(t.amount));
        return (
          <li key={t.id} className="flex flex-col gap-2 px-5 py-3 text-sm lg:flex-row lg:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${out ? "bg-surface-2 text-ink-2" : "bg-success-soft text-success"}`}>
                {out ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium">{t.text}</p>
                <p className="text-xs text-muted">
                  {formatDate(t.date)}
                  {t.counterparty ? ` · ${t.counterparty}` : ""}
                </p>
              </div>
            </div>
            <span className={`w-32 text-right font-medium tabular ${out ? "" : "text-success"}`}>
              {out ? "−" : "+"}
              {formatMoney(Math.abs(t.amount))}
            </span>
            <div className="flex min-w-0 items-center justify-end gap-2 lg:w-[420px]">
              {t.status === "matched" ? (
                t.invoice ? (
                  <Link href={`/app/invoices/${t.invoice.id}`} className="flex items-center gap-1.5 truncate text-xs text-success hover:underline">
                    <Check className="h-3.5 w-3.5" /> {t.invoice.supplier} {t.invoice.number}
                  </Link>
                ) : (
                  <Badge tone="success">Afstemt</Badge>
                )
              ) : t.status === "ignored" ? (
                <Badge>Ingen faktura</Badge>
              ) : !canMatch ? (
                <Badge tone="warning">Mangler afstemning</Badge>
              ) : t.invoice ? (
                <>
                  <span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-brand-ink">
                    <Sparkles className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      Forslag: {t.invoice.supplier} ({Math.round((t.confidence ?? 0) * 100)} %)
                    </span>
                  </span>
                  <Button size="sm" disabled={pending} onClick={() => run(() => matchTransactionAction(t.id, t.invoice!.id, t.paymentId))}>
                    Bekræft
                  </Button>
                </>
              ) : out ? (
                <>
                  <Select
                    value={picked[t.id] ?? ""}
                    onChange={(e) => setPicked((p) => ({ ...p, [t.id]: e.target.value }))}
                    className="h-8 min-w-0 flex-1 text-xs"
                    aria-label="Vælg faktura"
                  >
                    <option value="">{sameAmount.length ? `${sameAmount.length} faktura(er) med samme beløb…` : "Vælg faktura…"}</option>
                    {[...sameAmount, ...candidates.filter((c) => !sameAmount.includes(c))].map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                  <Button size="sm" disabled={pending || !picked[t.id]} onClick={() => run(() => matchTransactionAction(t.id, picked[t.id]!, null))}>
                    Match
                  </Button>
                  <button onClick={() => run(() => ignoreTransactionAction(t.id))} className="rounded-md p-1.5 text-muted hover:bg-surface-2" title="Ingen faktura (fx gebyr)">
                    <EyeOff className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <button onClick={() => run(() => ignoreTransactionAction(t.id))} className="text-xs text-muted hover:text-ink">
                  Markér som indbetaling
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
