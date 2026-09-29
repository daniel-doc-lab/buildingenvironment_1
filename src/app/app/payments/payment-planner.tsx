"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Landmark, FileDown, CalendarDays, X, BadgePercent, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, CardHeader, EmptyState, Select } from "@/components/ui";
import { createBatchAction, cancelPaymentAction, reschedulePaymentAction } from "./actions";
import { addDays, cn, formatDate, formatMoney, todayISO } from "@/lib/utils";

type P = {
  id: string;
  invoiceId: string | null;
  creditor: string;
  amount: number;
  date: string;
  dueDate: string | null;
  method: string;
  detail: string;
  message: string | null;
  discount: boolean;
};

export function PaymentPlanner({
  payments,
  accounts,
  defaultAccountId,
  canPay,
}: {
  payments: P[];
  accounts: { id: string; label: string; balance: number | null }[];
  defaultAccountId: string | null;
  canPay: boolean;
}) {
  const today = todayISO();
  const horizon = addDays(today, 7);
  const [sel, setSel] = useState<Set<string>>(new Set(payments.filter((p) => p.date <= horizon).map((p) => p.id)));
  const [account, setAccount] = useState(defaultAccountId ?? "");
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const router = useRouter();
  const total = payments.filter((p) => sel.has(p.id)).reduce((s, p) => s + p.amount, 0);
  const balance = accounts.find((a) => a.id === account)?.balance ?? null;

  const groups = useMemo(() => {
    const m = new Map<string, P[]>();
    for (const p of payments) m.set(p.date, [...(m.get(p.date) ?? []), p]);
    return [...m.entries()];
  }, [payments]);

  function create(method: "api" | "file") {
    if (!account) return void toast.error("Vælg en bankkonto");
    start(async () => {
      const r = await createBatchAction([...sel], account, method);
      if (!r.ok) return void toast.error(r.error);
      toast.success(
        r.data!.status === "awaiting_second_approval"
          ? "Batch oprettet – afventer 2. godkender (4-øjne-princip)"
          : method === "file"
            ? "Betalingsfil klar til download"
            : "Batch oprettet – klar til underskrift",
      );
      router.push(`/app/payments/batches/${r.data!.id}`);
    });
  }

  if (!payments.length) {
    return (
      <Card>
        <CardHeader title="Klar til betaling" />
        <EmptyState icon={<Landmark className="h-6 w-6" />} title="Ingen betalinger venter" description="Godkendte fakturaer dukker op her med den optimale betalingsdato." />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Klar til betaling"
        description="Betalinger der forfalder inden for 7 dage er valgt. Betalingsdatoen er sat, så I aldrig betaler for sent – eller for tidligt."
      />
      <div className="divide-y divide-line">
        {groups.map(([date, list]) => (
          <div key={date}>
            <div className="flex items-center gap-2 bg-surface-2/60 px-5 py-1.5 text-xs font-medium text-muted">
              <CalendarDays className="h-3.5 w-3.5" />
              {date <= today ? "I dag" : formatDate(date)} · {list.length} {list.length === 1 ? "betaling" : "betalinger"} · {formatMoney(list.reduce((s, p) => s + p.amount, 0))}
            </div>
            {list.map((p) => (
              <div key={p.id} className={cn("flex flex-wrap items-center gap-3 px-5 py-3 text-sm", sel.has(p.id) && "bg-brand-soft/25")}>
                {canPay ? (
                  <input
                    type="checkbox"
                    checked={sel.has(p.id)}
                    onChange={() => setSel((s) => (s.has(p.id) ? (s.delete(p.id), new Set(s)) : new Set(s.add(p.id))))}
                    className="accent-[var(--brand)]"
                    aria-label={`Vælg ${p.creditor}`}
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <Link href={p.invoiceId ? `/app/invoices/${p.invoiceId}` : "#"} className="block truncate font-medium hover:underline">
                    {p.creditor}
                  </Link>
                  <p className="truncate text-xs text-muted">
                    {p.method} · <span className="font-mono">{p.detail}</span>
                    {p.dueDate ? ` · forfald ${formatDate(p.dueDate, true)}` : ""}
                  </p>
                </div>
                {p.discount ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs text-success">
                    <BadgePercent className="h-3 w-3" /> Kontantrabat
                  </span>
                ) : null}
                {editing === p.id ? (
                  <input
                    type="date"
                    min={today}
                    defaultValue={p.date}
                    autoFocus
                    onBlur={() => setEditing(null)}
                    onChange={(e) =>
                      start(async () => {
                        const r = await reschedulePaymentAction(p.id, e.target.value);
                        if (!r.ok) toast.error(r.error);
                        setEditing(null);
                        router.refresh();
                      })
                    }
                    className="h-8 rounded-lg border border-line bg-surface px-2 text-xs"
                  />
                ) : canPay ? (
                  <button onClick={() => setEditing(p.id)} className="text-xs text-muted hover:text-ink" title="Flyt betalingsdato">
                    Flyt dato
                  </button>
                ) : null}
                <span className="w-28 text-right font-medium tabular">{formatMoney(p.amount)}</span>
                {canPay ? (
                  <button
                    onClick={() =>
                      confirm(`Annullér betalingen til ${p.creditor}? Fakturaen forbliver godkendt.`) &&
                      start(async () => {
                        const r = await cancelPaymentAction(p.id);
                        if (!r.ok) toast.error(r.error);
                        router.refresh();
                      })
                    }
                    className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-danger"
                    aria-label="Annullér betaling"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
      {canPay ? (
        <div className="flex flex-col gap-3 rounded-b-2xl border-t border-line bg-surface-2/50 px-5 py-4 lg:flex-row lg:items-center">
          <div className="flex-1">
            <p className="text-sm">
              <strong>{sel.size}</strong> valgt · <strong className="tabular">{formatMoney(total)}</strong>
            </p>
            {balance != null && total > balance ? <p className="text-xs text-danger">Beløbet overstiger saldoen på kontoen ({formatMoney(balance)})</p> : null}
          </div>
          <Select value={account} onChange={(e) => setAccount(e.target.value)} className="lg:w-80" aria-label="Betal fra konto">
            {accounts.length === 0 ? <option value="">Forbind en bank først</option> : null}
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={pending || !sel.size} onClick={() => create("file")} title="Hent ISO 20022-fil til upload i netbanken">
              <FileDown className="h-4 w-4" /> Betalingsfil
            </Button>
            <Button disabled={pending || !sel.size} onClick={() => create("api")}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />} Send til banken
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
