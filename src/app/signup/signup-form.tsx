"use client";

import { useActionState, useState, useTransition } from "react";
import { signupAction, cvrLookupAction } from "../auth-actions";
import { Button, Field, Input } from "@/components/ui";

export function SignupForm({ invite }: { invite?: string }) {
  const [state, action, pending] = useActionState(signupAction, undefined);
  const [company, setCompany] = useState("");
  const [cvrInfo, setCvrInfo] = useState<string | null>(null);
  const [looking, startLookup] = useTransition();

  function onCvr(v: string) {
    const digits = v.replace(/\D/g, "");
    if (digits.length === 8) {
      startLookup(async () => {
        const info = await cvrLookupAction(digits);
        if (info) {
          setCompany(info.name);
          setCvrInfo(`${info.name}${info.city ? ` · ${info.city}` : ""}`);
        } else setCvrInfo(null);
      });
    }
  }

  return (
    <form action={action} className="mt-6 space-y-4">
      {invite ? <input type="hidden" name="invite" value={invite} /> : null}
      <Field label="Dit navn" htmlFor="name">
        <Input id="name" name="name" required autoComplete="name" />
      </Field>
      <Field label="Arbejdsmail" htmlFor="email">
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </Field>
      <Field label="Adgangskode" htmlFor="password" hint="Mindst 8 tegn">
        <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
      </Field>
      {invite ? (
        <input type="hidden" name="companyName" value="invitation" />
      ) : (
        <>
          <Field label="CVR-nummer" htmlFor="cvr" hint={looking ? "Slår op i CVR…" : cvrInfo ? `Fundet: ${cvrInfo}` : "Vi henter navn og adresse automatisk"}>
            <Input id="cvr" name="cvr" inputMode="numeric" placeholder="12345678" onChange={(e) => onCvr(e.target.value)} />
          </Field>
          <Field label="Virksomhedens navn" htmlFor="companyName">
            <Input id="companyName" name="companyName" required value={company} onChange={(e) => setCompany(e.target.value)} />
          </Field>
        </>
      )}
      {state?.error ? <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p> : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Opretter…" : "Opret konto"}
      </Button>
      <p className="text-center text-xs text-muted">Ved at oprette en konto accepterer du vores vilkår og databehandleraftale.</p>
    </form>
  );
}
