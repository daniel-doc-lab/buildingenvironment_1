"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Sparkles, RefreshCw, Check, X, Send, Loader2, Wand2, CircleDollarSign } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { cn, formatMoney, toInputAmount, parseAmount, todayISO } from "@/lib/utils";
import { formatFik, formatIban, bankNameFromReg } from "@/lib/banking";
import {
  saveInvoiceAction,
  submitInvoiceAction,
  decideAction,
  reprocessInvoiceAction,
  recodeInvoiceAction,
  deleteInvoiceAction,
  markPaidAction,
} from "../../actions";

type Opt = { value: string; label: string };
type Line = {
  id?: string;
  description: string;
  quantity: number;
  amount: number;
  vatCode: string | null;
  accountNumber: string | null;
  departmentCode: string | null;
  propertyId: string | null;
  unitId: string | null;
  aiSuggested?: boolean;
  aiConfidence?: number | null;
  aiReason?: string | null;
};
type Inv = {
  id: string;
  status: string;
  kind: string;
  supplierId: string | null;
  supplierName: string | null;
  supplierCvr: string | null;
  invoiceNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  currency: string;
  amountExVat: number | null;
  vatAmount: number | null;
  totalAmount: number | null;
  paymentMethod: string | null;
  fikType: string | null;
  fikCreditor: string | null;
  fikPaymentId: string | null;
  bankReg: string | null;
  bankAccount: string | null;
  iban: string | null;
  bic: string | null;
  paymentMessage: string | null;
  propertyId: string | null;
  unitId: string | null;
  departmentCode: string | null;
  discountDate: string | null;
  discountAmount: number | null;
};

export function InvoiceEditor({
  invoice,
  lines: initialLines,
  options,
  perms,
  propertyModule,
}: {
  invoice: Inv;
  lines: Line[];
  options: {
    accounts: Opt[];
    vatCodes: (Opt & { rate: number })[];
    properties: Opt[];
    units: (Opt & { propertyId: string })[];
    departments: Opt[];
    suppliers: Opt[];
  };
  perms: { canEdit: boolean; canApprove: boolean; canPay: boolean; canDelete: boolean; canSubmit: boolean };
  propertyModule: boolean;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [lines, setLines] = useState<(Line & { amountText: string })[]>(initialLines.map((l) => ({ ...l, amountText: toInputAmount(l.amount) })));
  const [method, setMethod] = useState(invoice.paymentMethod ?? "");
  const [propertyId, setPropertyId] = useState(invoice.propertyId ?? "");
  const [dirty, setDirty] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const ro = !perms.canEdit;

  const lineSum = useMemo(() => lines.reduce((s, l) => s + (parseAmount(l.amountText) ?? 0), 0), [lines]);
  const vatSum = useMemo(
    () => lines.reduce((s, l) => s + Math.round((parseAmount(l.amountText) ?? 0) * (options.vatCodes.find((v) => v.value === l.vatCode)?.rate ?? 0)), 0),
    [lines, options.vatCodes],
  );

  function updateLine(i: number, patch: Partial<Line & { amountText: string }>) {
    setDirty(true);
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch, aiSuggested: patch.accountNumber !== undefined || patch.vatCode !== undefined ? false : l.aiSuggested } : l)));
  }

  function formData() {
    const fd = new FormData(form.current!);
    fd.set(
      "lines",
      JSON.stringify(
        lines.map((l) => ({
          id: l.id,
          description: l.description,
          quantity: l.quantity,
          amount: l.amountText,
          vatCode: l.vatCode,
          accountNumber: l.accountNumber,
          departmentCode: l.departmentCode,
          propertyId: l.propertyId,
          unitId: l.unitId,
        })),
      ),
    );
    return fd;
  }

  const act = (fn: () => Promise<{ ok: boolean; error?: string; message?: string } | void>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r && !r.ok) return void toast.error(r.error);
      if (r && r.message) toast.success(r.message);
      setDirty(false);
      after?.();
      router.refresh();
    });

  async function save() {
    return saveInvoiceAction(invoice.id, formData());
  }

  const fikLine = formatFik(invoice.fikType, invoice.fikPaymentId, invoice.fikCreditor) ?? "";
  const unitsForProp = options.units.filter((u) => u.propertyId === propertyId);

  return (
    <Card>
      <CardHeader
        title="Fakturadata"
        description={perms.canEdit ? "Felterne er udfyldt af AI. Ret det, der ikke passer." : "Fakturaen er låst, fordi den er godkendt."}
        action={
          perms.canEdit ? (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => reprocessInvoiceAction(invoice.id))} title="Læs dokumentet igen">
              <RefreshCw className="h-3.5 w-3.5" /> Læs igen
            </Button>
          ) : null
        }
      />
      <form ref={form} onChange={() => setDirty(true)} onSubmit={(e) => e.preventDefault()} className="space-y-5 p-5">
        <fieldset disabled={ro || pending} className="grid gap-4 sm:grid-cols-2">
          <Field label="Leverandør" className="sm:col-span-2">
            <div className="flex gap-2">
              <Select name="supplierId" defaultValue={invoice.supplierId ?? ""} className="flex-1">
                <option value="">– Ny / ukendt –</option>
                {options.suppliers.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
              {!invoice.supplierId ? <Input name="supplierName" defaultValue={invoice.supplierName ?? ""} placeholder="Navn" className="flex-1" /> : null}
            </div>
          </Field>
          <Field label="Fakturanummer">
            <Input name="invoiceNumber" defaultValue={invoice.invoiceNumber ?? ""} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fakturadato">
              <Input type="date" name="issueDate" defaultValue={invoice.issueDate ?? ""} />
            </Field>
            <Field label="Forfaldsdato">
              <Input type="date" name="dueDate" defaultValue={invoice.dueDate ?? ""} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:col-span-2">
            <Field label="Ekskl. moms">
              <Input name="amountExVat" inputMode="decimal" defaultValue={toInputAmount(invoice.amountExVat)} className="text-right tabular" />
            </Field>
            <Field label="Moms">
              <Input name="vatAmount" inputMode="decimal" defaultValue={toInputAmount(invoice.vatAmount)} className="text-right tabular" />
            </Field>
            <Field label={`Total (${invoice.currency})`}>
              <Input name="totalAmount" inputMode="decimal" defaultValue={toInputAmount(invoice.totalAmount)} className="text-right font-semibold tabular" />
            </Field>
          </div>
          <input type="hidden" name="currency" value={invoice.currency} />
        </fieldset>

        {/* Betaling */}
        <fieldset disabled={ro || pending} className="rounded-xl border border-line p-4">
          <legend className="px-1 text-[13px] font-medium text-ink-2">Betaling</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Betalingsmåde">
              <Select name="paymentMethod" value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="">Vælg…</option>
                <option value="fik">FI-kort (+71/+73/+75)</option>
                <option value="domestic">Bankoverførsel (reg. + konto)</option>
                <option value="iban">IBAN / udland</option>
                <option value="betalingsservice">Betalingsservice (trækkes automatisk)</option>
                <option value="card">Allerede betalt med kort</option>
                {invoice.kind === "expense" ? <option value="expense">Refusion til medarbejder</option> : null}
              </Select>
            </Field>
            {method === "fik" ? (
              <Field label="FI-kodelinje" hint="Fx +71<000000012345678+85012345<">
                <Input name="fikLine" defaultValue={fikLine} className="font-mono" />
              </Field>
            ) : method === "domestic" ? (
              <div className="grid grid-cols-[90px_1fr] gap-2">
                <Field label="Reg.nr." hint={bankNameFromReg(invoice.bankReg) ?? undefined}>
                  <Input name="bankReg" defaultValue={invoice.bankReg ?? ""} maxLength={4} className="font-mono" />
                </Field>
                <Field label="Kontonr.">
                  <Input name="bankAccount" defaultValue={invoice.bankAccount ?? ""} className="font-mono" />
                </Field>
              </div>
            ) : method === "iban" ? (
              <div className="grid grid-cols-[1fr_120px] gap-2">
                <Field label="IBAN">
                  <Input name="iban" defaultValue={formatIban(invoice.iban) ?? ""} className="font-mono" />
                </Field>
                <Field label="BIC">
                  <Input name="bic" defaultValue={invoice.bic ?? ""} className="font-mono" />
                </Field>
              </div>
            ) : (
              <div />
            )}
            {["fik", "domestic", "iban"].includes(method) ? (
              <Field label="Tekst til modtager" className="sm:col-span-2">
                <Input name="paymentMessage" defaultValue={invoice.paymentMessage ?? ""} maxLength={140} />
              </Field>
            ) : null}
          </div>
          {invoice.discountDate && invoice.discountAmount ? (
            <p className="mt-3 flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-xs text-success">
              <CircleDollarSign className="h-4 w-4" /> Kontantrabat: betal {formatMoney(invoice.discountAmount)} senest {invoice.discountDate}. Fluks planlægger betalingen automatisk.
            </p>
          ) : null}
        </fieldset>

        {propertyModule ? (
          <fieldset disabled={ro || pending} className="grid gap-3 sm:grid-cols-2">
            <Field label="Ejendom">
              <Select
                name="propertyId"
                value={propertyId}
                onChange={(e) => {
                  setPropertyId(e.target.value);
                  setLines((ls) => ls.map((l) => ({ ...l, propertyId: e.target.value || null, unitId: null })));
                }}
              >
                <option value="">Ingen</option>
                {options.properties.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Lejemål (valgfrit)">
              <Select name="unitId" defaultValue={invoice.unitId ?? ""} disabled={!propertyId}>
                <option value="">Fællesudgift</option>
                {unitsForProp.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </Select>
            </Field>
          </fieldset>
        ) : (
          <input type="hidden" name="propertyId" value={propertyId} />
        )}

        {/* Linjer og kontering */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] font-medium text-ink-2">Kontering</p>
            {perms.canEdit ? (
              <Button type="button" size="sm" variant="soft" disabled={pending} onClick={() => act(() => recodeInvoiceAction(invoice.id))}>
                <Wand2 className="h-3.5 w-3.5" /> AI-kontér igen
              </Button>
            ) : null}
          </div>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={l.id ?? i} className={cn("rounded-xl border p-3", l.aiSuggested && (l.aiConfidence ?? 0) < 0.6 ? "border-warning/40 bg-warning-soft/30" : "border-line")}>
                <div className="flex gap-2">
                  <Input
                    value={l.description}
                    disabled={ro}
                    onChange={(e) => updateLine(i, { description: e.target.value })}
                    className="flex-1"
                    placeholder="Beskrivelse"
                    aria-label="Beskrivelse"
                  />
                  <Input
                    value={l.amountText}
                    disabled={ro}
                    onChange={(e) => updateLine(i, { amountText: e.target.value })}
                    className="w-32 text-right tabular"
                    inputMode="decimal"
                    aria-label="Beløb ekskl. moms"
                  />
                  {!ro ? (
                    <Button type="button" size="icon" variant="ghost" onClick={() => (setDirty(true), setLines((ls) => ls.filter((_, j) => j !== i)))} aria-label="Fjern linje">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_170px]">
                  <Select value={l.accountNumber ?? ""} disabled={ro} onChange={(e) => updateLine(i, { accountNumber: e.target.value || null })} aria-label="Konto">
                    <option value="">Vælg konto…</option>
                    {options.accounts.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </Select>
                  <Select value={l.vatCode ?? ""} disabled={ro} onChange={(e) => updateLine(i, { vatCode: e.target.value || null })} aria-label="Momskode">
                    <option value="">Moms…</option>
                    {options.vatCodes.map((v) => (
                      <option key={v.value} value={v.value}>
                        {v.label}
                      </option>
                    ))}
                  </Select>
                </div>
                {l.aiSuggested && l.aiReason ? (
                  <p className={cn("mt-1.5 flex items-center gap-1.5 text-xs", (l.aiConfidence ?? 0) >= 0.8 ? "text-brand-ink" : "text-warning")}>
                    <Sparkles className="h-3 w-3" /> {l.aiReason} · {Math.round((l.aiConfidence ?? 0) * 100)} % sikker
                  </p>
                ) : l.aiReason ? (
                  <p className="mt-1.5 text-xs text-muted">{l.aiReason}</p>
                ) : null}
              </div>
            ))}
            {!ro ? (
              <button
                type="button"
                onClick={() => (
                  setDirty(true),
                  setLines((ls) => [...ls, { description: "", quantity: 1, amount: 0, amountText: "", vatCode: "I25", accountNumber: null, departmentCode: null, propertyId: propertyId || null, unitId: null }])
                )}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong py-2 text-sm text-muted hover:border-brand hover:text-brand"
              >
                <Plus className="h-4 w-4" /> Tilføj linje
              </button>
            ) : null}
          </div>
          <div className="mt-3 flex justify-end gap-6 text-sm">
            <span className="text-muted">
              Linjer: <span className="tabular text-ink">{formatMoney(lineSum)}</span>
            </span>
            <span className="text-muted">
              Moms: <span className="tabular text-ink">{formatMoney(vatSum)}</span>
            </span>
            <span className="text-muted">
              I alt: <span className="font-semibold tabular text-ink">{formatMoney(lineSum + vatSum)}</span>
            </span>
          </div>
        </div>
      </form>

      {/* Handlinger */}
      <div className="sticky bottom-16 z-10 flex flex-wrap items-center gap-2 rounded-b-2xl border-t border-line bg-surface/95 px-5 py-3 backdrop-blur lg:bottom-0">
        {pending ? <Loader2 className="h-4 w-4 animate-spin text-muted" /> : null}
        {perms.canDelete ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-danger"
            disabled={pending}
            onClick={() => confirm("Slet bilaget permanent?") && act(() => deleteInvoiceAction(invoice.id), () => router.push("/app/inbox"))}
          >
            <Trash2 className="h-4 w-4" /> Slet
          </Button>
        ) : null}
        <span className="flex-1" />
        {perms.canEdit && dirty ? (
          <Button variant="secondary" disabled={pending} onClick={() => act(save)}>
            Gem ændringer
          </Button>
        ) : null}
        {perms.canSubmit ? (
          <Button
            disabled={pending}
            onClick={() =>
              act(async () => {
                if (dirty) {
                  const s = await save();
                  if (!s.ok) return s;
                }
                const r = await submitInvoiceAction(invoice.id);
                if (r.ok) toast.success(r.data?.status === "approved" ? "Godkendt automatisk og sat til betaling" : `Sendt til godkendelse${r.data?.workflow ? ` (${r.data.workflow})` : ""}`);
                return r.ok ? undefined : r;
              })
            }
          >
            <Send className="h-4 w-4" /> Send til godkendelse
          </Button>
        ) : null}
        {perms.canApprove ? (
          rejecting ? (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Begrundelse (påkrævet)" className="min-h-9 sm:w-72" autoFocus />
              <Button variant="danger" disabled={pending || !reason.trim()} onClick={() => act(() => decideAction(invoice.id, "reject", reason), () => setRejecting(false))}>
                Afvis
              </Button>
              <Button variant="ghost" onClick={() => setRejecting(false)}>
                Fortryd
              </Button>
            </div>
          ) : (
            <>
              <Button variant="secondary" disabled={pending} onClick={() => setRejecting(true)}>
                <X className="h-4 w-4" /> Afvis
              </Button>
              <Button
                disabled={pending}
                onClick={() =>
                  act(async () => {
                    if (dirty && perms.canEdit) {
                      const s = await save();
                      if (!s.ok) return s;
                    }
                    return decideAction(invoice.id, "approve");
                  })
                }
              >
                <Check className="h-4 w-4" /> Godkend
              </Button>
            </>
          )
        ) : null}
        {perms.canPay ? (
          <Button variant="secondary" disabled={pending} onClick={() => act(() => markPaidAction(invoice.id, todayISO()))}>
            Markér som betalt
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
