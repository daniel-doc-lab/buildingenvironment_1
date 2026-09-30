"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { createAdditionalCompanyAction } from "../auth-actions";
import { finishOnboardingAction } from "../app/settings/actions";

export function NewCompanyForm() {
  const [state, action, pending] = useActionState(createAdditionalCompanyAction, undefined);
  return (
    <form action={action} className="mt-6 space-y-4">
      <Field label="CVR-nummer">
        <Input name="cvr" inputMode="numeric" />
      </Field>
      <Field label="Virksomhedens navn">
        <Input name="companyName" required />
      </Field>
      {state?.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        Opret virksomhed
      </Button>
    </form>
  );
}

export function FinishButton() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        start(async () => {
          await finishOnboardingAction();
          router.push("/app");
        })
      }
    >
      Gå til Fluks →
    </Button>
  );
}
