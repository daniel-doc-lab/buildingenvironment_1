"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowDown, GitBranch, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardHeader, Field, Input, Select } from "@/components/ui";
import { saveWorkflowAction, deleteWorkflowAction } from "../actions";
import { formatMoney, toInputAmount } from "@/lib/utils";
import { ROLE_LABELS_CLIENT } from "@/lib/roles";
import type { WorkflowConditions, WorkflowStep, Role } from "@/db/schema";

type WF = { id: string; name: string; priority: number; active: boolean; conditions: WorkflowConditions; steps: WorkflowStep[] };
type Draft = {
  id: string | null;
  name: string;
  priority: number;
  active: boolean;
  conditions: { minAmount: string; maxAmount: string; supplierIds: string[]; propertyIds: string[]; newSupplierOnly: boolean; kinds: string[] };
  steps: { name: string; approverIds: string[]; role: string | null; mode: "any" | "all" }[];
};

function toDraft(w?: WF): Draft {
  return {
    id: w?.id ?? null,
    name: w?.name ?? "",
    priority: w?.priority ?? 50,
    active: w?.active ?? true,
    conditions: {
      minAmount: toInputAmount(w?.conditions.minAmount ?? null),
      maxAmount: toInputAmount(w?.conditions.maxAmount ?? null),
      supplierIds: w?.conditions.supplierIds ?? [],
      propertyIds: w?.conditions.propertyIds ?? [],
      newSupplierOnly: !!w?.conditions.newSupplierOnly,
      kinds: w?.conditions.kinds ?? [],
    },
    steps: w?.steps.map((s) => ({ ...s, role: s.role ?? null })) ?? [{ name: "Godkender", approverIds: [], role: null, mode: "any" }],
  };
}

export function WorkflowEditor({
  workflows,
  members,
  properties,
  suppliers,
  canEdit,
}: {
  workflows: WF[];
  members: { id: string; name: string; role: Role }[];
  properties: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? "?";

  function describe(c: WorkflowConditions) {
    const parts: string[] = [];
    if (c.kinds?.length) parts.push(c.kinds.map((k) => (k === "expense" ? "udlæg" : k === "credit_note" ? "kreditnotaer" : "fakturaer")).join(" og "));
    if (c.minAmount != null) parts.push(`beløb fra ${formatMoney(c.minAmount, "DKK", { compact: true })}`);
    if (c.maxAmount != null) parts.push(`op til ${formatMoney(c.maxAmount, "DKK", { compact: true })}`);
    if (c.propertyIds?.length) parts.push(`ejendom: ${c.propertyIds.map((p) => properties.find((x) => x.id === p)?.name ?? "?").join(", ")}`);
    if (c.supplierIds?.length) parts.push(`leverandør: ${c.supplierIds.map((p) => suppliers.find((x) => x.id === p)?.name ?? "?").join(", ")}`);
    if (c.newSupplierOnly) parts.push("nye leverandører");
    return parts.length ? `Når ${parts.join(" · ")}` : "Alle øvrige bilag";
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Godkendelsesflows"
          description="Fluks bruger det første flow (laveste prioritet), hvis betingelser passer. Ingen flow = automatisk godkendt."
          action={
            canEdit ? (
              <Button size="sm" onClick={() => setDraft(toDraft())}>
                <Plus className="h-4 w-4" /> Nyt flow
              </Button>
            ) : null
          }
        />
        <ul className="divide-y divide-line">
          {workflows.map((w) => (
            <li key={w.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-sm font-semibold text-brand-ink">{w.priority}</span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium">
                  {w.name} {!w.active ? <Badge>Inaktiv</Badge> : null}
                </p>
                <p className="text-xs text-muted">{describe(w.conditions)}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  {w.steps.map((s, i) => (
                    <span key={i} className="flex items-center gap-1.5">
                      {i > 0 ? <span className="text-muted">→</span> : null}
                      <span className="rounded-lg border border-line bg-surface-2 px-2 py-1">
                        <span className="font-medium">{s.name}</span>
                        <span className="text-muted">
                          {" "}
                          · {[...s.approverIds.map(name), ...(s.role ? [`alle ${ROLE_LABELS_CLIENT[s.role as Role].toLowerCase()}e`] : [])].join(", ")}
                          {s.mode === "all" && s.approverIds.length > 1 ? " (alle skal)" : ""}
                        </span>
                      </span>
                    </span>
                  ))}
                </div>
              </div>
              {canEdit ? (
                <Button size="sm" variant="ghost" onClick={() => setDraft(toDraft(w))}>
                  <Pencil className="h-3.5 w-3.5" /> Redigér
                </Button>
              ) : null}
            </li>
          ))}
          {workflows.length === 0 ? (
            <li className="flex flex-col items-center gap-2 px-5 py-10 text-center text-sm text-muted">
              <GitBranch className="h-6 w-6" /> Ingen flows – alle bilag godkendes automatisk.
            </li>
          ) : null}
        </ul>
      </Card>

      {draft ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/40" onClick={() => setDraft(null)}>
          <div className="animate-in h-full w-full max-w-xl overflow-y-auto bg-surface p-6 shadow-pop" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{draft.id ? "Redigér flow" : "Nyt godkendelsesflow"}</h2>
              <button onClick={() => setDraft(null)} className="rounded-lg p-1 hover:bg-surface-2" aria-label="Luk">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-5">
              <div className="grid grid-cols-[1fr_110px] gap-3">
                <Field label="Navn">
                  <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Fx Store beløb" />
                </Field>
                <Field label="Prioritet" hint="Lavest først">
                  <Input type="number" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })} />
                </Field>
              </div>
              <div className="rounded-xl border border-line p-4">
                <p className="mb-3 text-sm font-medium">Hvornår gælder flowet?</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Beløb fra (kr.)">
                    <Input value={draft.conditions.minAmount} onChange={(e) => setDraft({ ...draft, conditions: { ...draft.conditions, minAmount: e.target.value } })} inputMode="decimal" />
                  </Field>
                  <Field label="Beløb til (kr.)">
                    <Input value={draft.conditions.maxAmount} onChange={(e) => setDraft({ ...draft, conditions: { ...draft.conditions, maxAmount: e.target.value } })} inputMode="decimal" />
                  </Field>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  {[
                    ["invoice", "Fakturaer"],
                    ["credit_note", "Kreditnotaer"],
                    ["expense", "Udlæg"],
                  ].map(([k, l]) => (
                    <label key={k} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        className="accent-[var(--brand)]"
                        checked={draft.conditions.kinds.includes(k!)}
                        onChange={(e) =>
                          setDraft({ ...draft, conditions: { ...draft.conditions, kinds: e.target.checked ? [...draft.conditions.kinds, k!] : draft.conditions.kinds.filter((x) => x !== k) } })
                        }
                      />
                      {l}
                    </label>
                  ))}
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      className="accent-[var(--brand)]"
                      checked={draft.conditions.newSupplierOnly}
                      onChange={(e) => setDraft({ ...draft, conditions: { ...draft.conditions, newSupplierOnly: e.target.checked } })}
                    />
                    Kun nye leverandører
                  </label>
                </div>
                {properties.length ? (
                  <MultiPick
                    label="Ejendomme"
                    options={properties}
                    value={draft.conditions.propertyIds}
                    onChange={(v) => setDraft({ ...draft, conditions: { ...draft.conditions, propertyIds: v } })}
                  />
                ) : null}
                <MultiPick label="Leverandører" options={suppliers} value={draft.conditions.supplierIds} onChange={(v) => setDraft({ ...draft, conditions: { ...draft.conditions, supplierIds: v } })} />
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Godkendelsestrin</p>
                <div className="space-y-2">
                  {draft.steps.map((s, i) => (
                    <div key={i}>
                      {i > 0 ? (
                        <div className="flex justify-center py-1 text-muted">
                          <ArrowDown className="h-4 w-4" />
                        </div>
                      ) : null}
                      <div className="rounded-xl border border-line p-4">
                        <div className="flex gap-2">
                          <Input
                            value={s.name}
                            onChange={(e) => setDraft({ ...draft, steps: draft.steps.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
                            placeholder="Trinnets navn"
                          />
                          {draft.steps.length > 1 ? (
                            <Button variant="ghost" size="icon" onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, j) => j !== i) })} aria-label="Fjern trin">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                        <MultiPick
                          label="Godkendere"
                          options={members.map((m) => ({ id: m.id, name: m.name }))}
                          value={s.approverIds}
                          onChange={(v) => setDraft({ ...draft, steps: draft.steps.map((x, j) => (j === i ? { ...x, approverIds: v } : x)) })}
                        />
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <Field label="…eller alle med rollen">
                            <Select value={s.role ?? ""} onChange={(e) => setDraft({ ...draft, steps: draft.steps.map((x, j) => (j === i ? { ...x, role: e.target.value || null } : x)) })}>
                              <option value="">Ingen</option>
                              {(["owner", "admin", "accountant", "approver"] as Role[]).map((r) => (
                                <option key={r} value={r}>
                                  {ROLE_LABELS_CLIENT[r]}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <Field label="Krav">
                            <Select value={s.mode} onChange={(e) => setDraft({ ...draft, steps: draft.steps.map((x, j) => (j === i ? { ...x, mode: e.target.value as "any" | "all" } : x)) })}>
                              <option value="any">Én af dem</option>
                              <option value="all">Alle skal godkende</option>
                            </Select>
                          </Field>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setDraft({ ...draft, steps: [...draft.steps, { name: `Trin ${draft.steps.length + 1}`, approverIds: [], role: null, mode: "any" }] })}>
                  <Plus className="h-4 w-4" /> Tilføj trin
                </Button>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="accent-[var(--brand)]" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Aktivt
              </label>
              <div className="flex items-center gap-2 border-t border-line pt-4">
                {draft.id ? (
                  <Button
                    variant="ghost"
                    className="text-danger"
                    disabled={pending}
                    onClick={() =>
                      confirm("Slet flowet?") &&
                      start(async () => {
                        const r = await deleteWorkflowAction(draft.id!);
                        if (!r.ok) return void toast.error(r.error);
                        setDraft(null);
                        router.refresh();
                      })
                    }
                  >
                    Slet
                  </Button>
                ) : null}
                <span className="flex-1" />
                <Button variant="secondary" onClick={() => setDraft(null)}>
                  Annullér
                </Button>
                <Button
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await saveWorkflowAction(draft);
                      if (!r.ok) return void toast.error(r.error);
                      toast.success(r.message);
                      setDraft(null);
                      router.refresh();
                    })
                  }
                >
                  Gem flow
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MultiPick({ label, options, value, onChange }: { label: string; options: { id: string; name: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[13px] font-medium text-ink-2">{label}</p>
      <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
        {options.map((o) => {
          const on = value.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(on ? value.filter((v) => v !== o.id) : [...value, o.id])}
              className={`rounded-full border px-2.5 py-1 text-xs transition ${on ? "border-brand bg-brand text-white" : "border-line bg-surface hover:border-brand"}`}
            >
              {o.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
