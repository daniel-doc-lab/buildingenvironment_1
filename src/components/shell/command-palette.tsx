"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, CornerDownLeft, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { bulkApproveAction } from "@/app/app/actions";
import { cn, formatMoney, formatDate } from "@/lib/utils";
import { STATUS } from "@/lib/labels";
import type { AssistantReply } from "@/server/services/assistant";

const PAGES = [
  { label: "Overblik", href: "/app", keys: "dashboard forside" },
  { label: "Indbakke", href: "/app/inbox", keys: "fakturaer bilag" },
  { label: "Upload faktura", href: "/app/inbox?upload=1", keys: "ny upload tilføj" },
  { label: "Godkendelser", href: "/app/approvals", keys: "godkend attest" },
  { label: "Betalinger", href: "/app/payments", keys: "betal batch" },
  { label: "Bank & afstemning", href: "/app/bank", keys: "posteringer saldo afstem" },
  { label: "Leverandører", href: "/app/suppliers", keys: "kreditorer" },
  { label: "Ejendomme", href: "/app/properties", keys: "boligflow lejemål" },
  { label: "Nyt udlæg", href: "/app/expenses?new=1", keys: "kvittering udlæg" },
  { label: "Likviditet", href: "/app/cashflow", keys: "prognose cash" },
  { label: "Rapporter", href: "/app/reports", keys: "analyse eksport" },
  { label: "Godkendelsesflows", href: "/app/settings/workflows", keys: "regler flow" },
  { label: "Integrationer", href: "/app/settings/integrations", keys: "e-conomic boligflow bank nemhandel api" },
  { label: "Brugere", href: "/app/settings/users", keys: "team inviter" },
];

const SUGGESTIONS = ["Hvad forfalder i denne uge?", "Hvad venter på min godkendelse?", "Hvor meget har vi brugt på el i år?", "Er der mistænkelige fakturaer?", "Hvordan ser likviditeten ud?"];

export function CommandPalette({ aiLabel }: { aiLabel: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [reply, setReply] = useState<AssistantReply | null>(null);
  const [asked, setAsked] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("fluks:palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("fluks:palette", onOpen);
    };
  }, []);
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  const matches = useMemo(() => {
    const t = q.toLowerCase().trim();
    if (!t) return PAGES.slice(0, 6);
    return PAGES.filter((p) => `${p.label} ${p.keys}`.toLowerCase().includes(t)).slice(0, 6);
  }, [q]);
  const options = [...(q.trim() ? [{ label: `Spørg AI: "${q.trim()}"`, ai: true as const }] : []), ...matches.map((m) => ({ ...m, ai: false as const }))];

  async function ask(question: string) {
    setAsked(question);
    setLoading(true);
    setReply(null);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      const data = (await res.json()) as AssistantReply & { error?: string };
      if (!res.ok) throw new Error(data.error);
      setReply(data);
    } catch (e) {
      setReply({ answer: `Fejl: ${(e as Error).message}`, engine: "demo" });
    } finally {
      setLoading(false);
    }
  }

  function choose(i: number) {
    const o = options[i];
    if (!o) return;
    if (o.ai) return void ask(q.trim());
    setOpen(false);
    router.push((o as (typeof PAGES)[number]).href);
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 p-4 pt-[10vh] backdrop-blur-[2px]" onClick={() => setOpen(false)}>
      <div className="animate-in w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-surface shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Sparkles className="h-5 w-5 text-brand" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(options.length - 1, s + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(sel);
              }
            }}
            placeholder="Spørg om fakturaer, forbrug, likviditet – eller hop til en side"
            className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
          />
          <span className="rounded-md bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-ink">{aiLabel}</span>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {loading || reply ? (
            <div className="p-3">
              <p className="mb-2 text-xs font-medium text-muted">Du spurgte: {asked}</p>
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" /> Tænker…
                </div>
              ) : reply ? (
                <div className="space-y-3">
                  <div className="whitespace-pre-line text-sm leading-relaxed text-ink" dangerouslySetInnerHTML={{ __html: md(reply.answer) }} />
                  {reply.items?.length ? (
                    <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                      {reply.items.slice(0, 10).map((it) => (
                        <Link key={it.id} href={`/app/invoices/${it.id}`} onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-surface-2">
                          <span className="flex-1 truncate font-medium">{it.supplier}</span>
                          <span className="hidden text-xs text-muted sm:inline">{it.number}</span>
                          <span className="text-xs text-muted">{formatDate(it.dueDate, true)}</span>
                          <span className="w-28 text-right tabular">{formatMoney(it.amount)}</span>
                          <span className="hidden w-32 text-right text-xs text-muted md:inline">{STATUS[it.status as keyof typeof STATUS]?.label ?? it.status}</span>
                        </Link>
                      ))}
                    </div>
                  ) : null}
                  {reply.actions?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {reply.actions.map((a, i) =>
                        a.type === "approve" ? (
                          <button
                            key={i}
                            disabled={pending}
                            onClick={() =>
                              start(async () => {
                                const r = await bulkApproveAction(a.invoiceIds);
                                if (r.ok) {
                                  toast.success(`${r.data?.approved} godkendt${r.data?.failed ? `, ${r.data.failed} fejlede` : ""}`);
                                  setReply({ answer: "✅ Godkendt. Betalingerne er planlagt til forfaldsdagen.", engine: reply.engine });
                                  router.refresh();
                                } else toast.error(r.error);
                              })
                            }
                            className="inline-flex h-9 items-center gap-2 rounded-xl bg-brand px-3 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
                          >
                            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {a.label}
                          </button>
                        ) : (
                          <Link key={i} href={a.href} onClick={() => setOpen(false)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-sm hover:bg-surface-2">
                            {a.label} <ArrowRight className="h-4 w-4" />
                          </Link>
                        ),
                      )}
                    </div>
                  ) : null}
                  <button onClick={() => (setReply(null), setQ(""), inputRef.current?.focus())} className="text-xs text-muted hover:text-ink">
                    ← Nyt spørgsmål
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              {options.map((o, i) => (
                <button
                  key={o.label}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => choose(i)}
                  className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm", sel === i ? "bg-brand-soft text-brand-ink" : "text-ink")}
                >
                  {o.ai ? <Sparkles className="h-4 w-4" /> : <ArrowRight className="h-4 w-4 text-muted" />}
                  <span className="flex-1 truncate">{o.label}</span>
                  {sel === i ? <CornerDownLeft className="h-4 w-4 opacity-60" /> : null}
                </button>
              ))}
              {!q.trim() ? (
                <div className="mt-2 border-t border-line px-3 pb-2 pt-3">
                  <p className="mb-2 text-xs font-medium text-muted">Prøv at spørge</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} onClick={() => (setQ(s), ask(s))} className="rounded-full border border-line px-3 py-1 text-xs text-ink-2 hover:border-brand hover:text-brand">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function md(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/_(.+?)_/g, "<em>$1</em>");
}
