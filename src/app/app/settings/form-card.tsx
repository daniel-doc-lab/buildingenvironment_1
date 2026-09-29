"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, Card, CardHeader } from "@/components/ui";

/** Generisk kort med formular, der kalder en server action og viser toast. */
export function FormCard({
  title,
  description,
  action,
  children,
  submitLabel = "Gem",
  disabled,
  resetOnSuccess,
}: {
  title: string;
  description?: string;
  action: (fd: FormData) => Promise<{ ok: boolean; error?: string; message?: string }>;
  children: React.ReactNode;
  submitLabel?: string;
  disabled?: boolean;
  resetOnSuccess?: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          const el = e.currentTarget;
          const fd = new FormData(el);
          start(async () => {
            const r = await action(fd);
            if (!r.ok) return void toast.error(r.error);
            if (r.message) toast.success(r.message);
            if (resetOnSuccess) el.reset();
            router.refresh();
          });
        }}
      >
        <fieldset disabled={disabled || pending} className="space-y-4">
          {children}
        </fieldset>
        {!disabled ? (
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Gemmer…" : submitLabel}
            </Button>
          </div>
        ) : null}
      </form>
    </Card>
  );
}
