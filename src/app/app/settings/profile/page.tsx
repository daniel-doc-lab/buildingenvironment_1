import type { Metadata } from "next";
import { requireCompany } from "@/server/auth";
import { Field, Input } from "@/components/ui";
import { FormCard } from "../form-card";
import { saveProfileAction } from "../actions";

export const metadata: Metadata = { title: "Min profil" };

export default async function ProfilePage() {
  const ctx = await requireCompany();
  const u = ctx.user;
  return (
    <FormCard title="Min profil" description="Dine bankoplysninger bruges kun til refusion af udlæg." action={saveProfileAction}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Navn">
          <Input name="name" defaultValue={u.name} />
        </Field>
        <Field label="E-mail">
          <Input defaultValue={u.email} disabled />
        </Field>
        <Field label="Telefon">
          <Input name="phone" defaultValue={u.phone ?? ""} />
        </Field>
        <div className="grid grid-cols-[90px_1fr] gap-2">
          <Field label="Reg.nr.">
            <Input name="bankReg" defaultValue={u.bankReg ?? ""} className="font-mono" maxLength={4} />
          </Field>
          <Field label="Kontonr.">
            <Input name="bankAccount" defaultValue={u.bankAccount ?? ""} className="font-mono" />
          </Field>
        </div>
      </div>
      <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
        <Field label="Nuværende adgangskode">
          <Input name="currentPassword" type="password" autoComplete="current-password" />
        </Field>
        <Field label="Ny adgangskode" hint="Udfyld kun hvis du vil skifte">
          <Input name="password" type="password" autoComplete="new-password" minLength={8} />
        </Field>
      </div>
    </FormCard>
  );
}
