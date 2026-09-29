import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireCompany, can } from "@/server/auth";
import { Field, Input, Select } from "@/components/ui";
import { FormCard } from "./form-card";
import { saveCompanyAction } from "./actions";
import { toInputAmount } from "@/lib/utils";

export const metadata: Metadata = { title: "Indstillinger" };

export default async function CompanySettings() {
  const ctx = await requireCompany();
  const s = ctx.company.settings;
  const accounts = await ctx.db.select().from(schema.bankAccounts).where(eq(schema.bankAccounts.companyId, ctx.company.id));
  const disabled = !can(ctx.role, "manageCompany");
  return (
    <div className="space-y-6">
      <FormCard title="Virksomhed" action={saveCompanyAction} disabled={disabled}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Navn">
            <Input name="name" defaultValue={ctx.company.name} />
          </Field>
          <Field label="CVR-nummer" hint="Bruges til NemHandel og til at genkende jeres egne data på fakturaer">
            <Input name="cvr" defaultValue={ctx.company.cvr ?? ""} className="font-mono" />
          </Field>
          <Field label="Adresse" className="sm:col-span-2">
            <Input name="address" defaultValue={ctx.company.address ?? ""} />
          </Field>
        </div>
        <div className="border-t border-line pt-4">
          <p className="mb-3 text-sm font-medium">Betalinger og kontrol</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Betal antal bankdage før forfald" hint="Buffer så betalingen er modtaget til tiden">
              <Input name="paymentLeadDays" type="number" min={0} max={10} defaultValue={s.paymentLeadDays ?? 1} />
            </Field>
            <Field label="Standard betalingskonto">
              <Select name="defaultPaymentAccountId" defaultValue={s.defaultPaymentAccountId ?? ""}>
                <option value="">Vælg…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.bankName} · {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="4-øjne-grænse (kr.)" hint="Betalingsbatches over beløbet skal godkendes af to personer">
              <Input name="fourEyesThreshold" inputMode="decimal" defaultValue={toInputAmount(s.fourEyesThreshold ?? 5_000_000)} className="text-right tabular" />
            </Field>
            <Field label="Auto-godkend under (kr.)" hint="Gælder kun betroede leverandører uden advarsler. 0 = slået fra">
              <Input name="autoApproveBelow" inputMode="decimal" defaultValue={toInputAmount(s.autoApproveBelow ?? 0)} className="text-right tabular" />
            </Field>
            <Field label="Påmindelse til godkendere efter (timer)">
              <Input name="reminderHours" type="number" min={1} defaultValue={s.reminderHours ?? 24} />
            </Field>
          </div>
        </div>
        <label className="flex items-start gap-3 rounded-xl border border-line p-4 text-sm">
          <input type="checkbox" name="propertyModule" defaultChecked={!!s.propertyModule} className="mt-0.5 accent-[var(--brand)]" />
          <span>
            <span className="font-medium">Ejendomsmodul</span>
            <span className="block text-xs text-muted">Kontering pr. ejendom og lejemål, budgetopfølgning og Boligflow-integration.</span>
          </span>
        </label>
      </FormCard>
    </div>
  );
}
