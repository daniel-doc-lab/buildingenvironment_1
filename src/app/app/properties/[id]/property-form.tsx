"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, Card, CardHeader, Field, Input } from "@/components/ui";
import { savePropertyAction } from "../actions";
import { toInputAmount } from "@/lib/utils";

export function PropertyForm({ property, canEdit }: { property: { id: string; name: string; address: string | null; annualBudget: number | null; departmentCode: string | null }; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Card>
      <CardHeader title="Indstillinger" />
      <form
        className="space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          start(async () => {
            const r = await savePropertyAction(property.id, fd);
            if (!r.ok) return void toast.error(r.error);
            toast.success(r.message);
            router.refresh();
          });
        }}
      >
        <fieldset disabled={!canEdit || pending} className="space-y-3">
          <Field label="Navn">
            <Input name="name" defaultValue={property.name} />
          </Field>
          <Field label="Adresse" hint="Bruges af AI til at genkende fakturaer for ejendommen">
            <Input name="address" defaultValue={property.address ?? ""} />
          </Field>
          <Field label="Årsbudget (kr.)">
            <Input name="annualBudget" inputMode="decimal" defaultValue={toInputAmount(property.annualBudget)} className="text-right tabular" />
          </Field>
          <Field label="Afdeling i regnskabet" hint="Udgifter bogføres på denne afdeling/dimension i e-conomic">
            <Input name="departmentCode" defaultValue={property.departmentCode ?? ""} />
          </Field>
        </fieldset>
        {canEdit ? (
          <Button type="submit" disabled={pending} className="w-full">
            Gem
          </Button>
        ) : null}
      </form>
    </Card>
  );
}
