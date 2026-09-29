"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, CardHeader, Field, Input, Select, Textarea, Badge } from "@/components/ui";
import { saveSupplierAction, enrichFromCvrAction, verifyBankAction } from "../actions";
import type { schema } from "@/db";

type Supplier = typeof schema.suppliers.$inferSelect;
type Opt = { value: string; label: string };

export function SupplierForm({
  supplier,
  canEdit,
  accounts,
  vatCodes,
  properties,
  rules,
}: {
  supplier: Supplier | null;
  canEdit: boolean;
  accounts: Opt[];
  vatCodes: Opt[];
  properties: Opt[];
  rules: { name: string; source: string; hits: number }[];
}) {
  const [pending, start] = useTransition();
  const [vals, setVals] = useState({ name: supplier?.name ?? "", cvr: supplier?.cvr ?? "", address: supplier?.address ?? "", email: supplier?.email ?? "", phone: supplier?.phone ?? "" });
  const router = useRouter();
  const needsVerify = supplier?.bankChangedAt && (!supplier.bankVerifiedAt || supplier.bankVerifiedAt < supplier.bankChangedAt);

  return (
    <Card>
      <CardHeader title="Stamdata" />
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          start(async () => {
            const r = await saveSupplierAction(supplier?.id ?? null, fd);
            if (!r.ok) return void toast.error(r.error);
            toast.success(r.message);
            if (!supplier) router.push(`/app/suppliers/${r.data!.id}`);
            else router.refresh();
          });
        }}
      >
        <fieldset disabled={!canEdit || pending} className="space-y-4">
          <Field label="CVR-nummer">
            <div className="flex gap-2">
              <Input name="cvr" value={vals.cvr} onChange={(e) => setVals({ ...vals, cvr: e.target.value })} inputMode="numeric" className="font-mono" />
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  start(async () => {
                    const info = await enrichFromCvrAction(vals.cvr);
                    if (!info) return void toast.error("CVR-nummeret blev ikke fundet");
                    setVals({
                      name: info.name,
                      cvr: info.cvr,
                      address: [info.address, [info.zip, info.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
                      email: info.email ?? vals.email,
                      phone: info.phone ?? vals.phone,
                    });
                    toast.success("Hentet fra CVR-registret");
                  })
                }
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Slå op
              </Button>
            </div>
          </Field>
          <Field label="Navn">
            <Input name="name" required value={vals.name} onChange={(e) => setVals({ ...vals, name: e.target.value })} />
          </Field>
          <Field label="Adresse">
            <Input name="address" value={vals.address} onChange={(e) => setVals({ ...vals, address: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="E-mail">
              <Input name="email" type="email" value={vals.email} onChange={(e) => setVals({ ...vals, email: e.target.value })} />
            </Field>
            <Field label="Telefon">
              <Input name="phone" value={vals.phone} onChange={(e) => setVals({ ...vals, phone: e.target.value })} />
            </Field>
          </div>

          <div className="rounded-xl border border-line p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[13px] font-medium text-ink-2">Betalingsoplysninger</p>
              {needsVerify ? <Badge tone="danger">Ændret – ikke bekræftet</Badge> : supplier?.bankVerifiedAt ? <Badge tone="success">Bekræftet</Badge> : null}
            </div>
            <div className="grid grid-cols-[90px_1fr] gap-2">
              <Field label="Reg.nr.">
                <Input name="bankReg" defaultValue={supplier?.bankReg ?? ""} className="font-mono" />
              </Field>
              <Field label="Kontonr.">
                <Input name="bankAccount" defaultValue={supplier?.bankAccount ?? ""} className="font-mono" />
              </Field>
            </div>
            <div className="mt-3 grid grid-cols-[1fr_110px] gap-2">
              <Field label="IBAN">
                <Input name="iban" defaultValue={supplier?.iban ?? ""} className="font-mono" />
              </Field>
              <Field label="BIC">
                <Input name="bic" defaultValue={supplier?.bic ?? ""} className="font-mono" />
              </Field>
            </div>
            <Field label="FI-kreditornummer" className="mt-3">
              <Input name="fiCreditor" defaultValue={supplier?.fiCreditor ?? ""} className="font-mono" />
            </Field>
            {needsVerify && supplier ? (
              <Button
                type="button"
                variant="soft"
                size="sm"
                className="mt-3"
                onClick={() =>
                  start(async () => {
                    const r = await verifyBankAction(supplier.id);
                    if (!r.ok) return void toast.error(r.error);
                    toast.success(r.message);
                    router.refresh();
                  })
                }
              >
                Jeg har bekræftet oplysningerne telefonisk
              </Button>
            ) : null}
          </div>

          <div className="rounded-xl border border-line p-4">
            <p className="mb-3 flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
              <Sparkles className="h-3.5 w-3.5 text-brand" /> Standardkontering
            </p>
            <div className="grid gap-3">
              <Field label="Konto" hint="Tom = AI vælger ud fra historik og fakturatekst">
                <Select name="defaultAccount" defaultValue={supplier?.defaultAccount ?? ""}>
                  <option value="">Lad AI vælge</option>
                  {accounts.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Momskode">
                  <Select name="defaultVatCode" defaultValue={supplier?.defaultVatCode ?? ""}>
                    <option value="">Automatisk</option>
                    {vatCodes.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Betalingsfrist (dage)">
                  <Input name="paymentTermsDays" type="number" min={0} defaultValue={supplier?.paymentTermsDays ?? ""} />
                </Field>
              </div>
              {properties.length ? (
                <Field label="Standard-ejendom">
                  <Select name="defaultPropertyId" defaultValue={supplier?.defaultPropertyId ?? ""}>
                    <option value="">Ingen</option>
                    {properties.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
            </div>
            {rules.length ? (
              <ul className="mt-3 space-y-1 text-xs text-muted">
                {rules.map((r) => (
                  <li key={r.name}>
                    {r.source === "learned" ? "Lært regel" : "Regel"}: {r.name} · brugt {r.hits} gange
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-line p-4 text-sm">
            <input type="checkbox" name="trusted" defaultChecked={supplier?.trusted ?? false} className="mt-0.5 accent-[var(--brand)]" />
            <span>
              <span className="font-medium">Betroet leverandør</span>
              <span className="block text-xs text-muted">Små fakturaer under grænsen for automatisk godkendelse betales uden manuel godkendelse (hvis ingen advarsler).</span>
            </span>
          </label>
          <Field label="Noter">
            <Textarea name="notes" defaultValue={supplier?.notes ?? ""} />
          </Field>
        </fieldset>
        {canEdit ? (
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {supplier ? "Gem ændringer" : "Opret leverandør"}
          </Button>
        ) : null}
      </form>
    </Card>
  );
}
