"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { dismissFlagAction, rejectAsDuplicateAction } from "../../actions";
import { cn } from "@/lib/utils";
import type { InvoiceFlag } from "@/db/schema";

const STYLE = {
  critical: { box: "border-danger/30 bg-danger-soft", text: "text-danger", icon: ShieldAlert },
  warning: { box: "border-warning/30 bg-warning-soft", text: "text-warning", icon: AlertTriangle },
  info: { box: "border-line bg-surface", text: "text-info", icon: Info },
};

export function FlagList({ invoiceId, flags, canEdit }: { invoiceId: string; flags: InvoiceFlag[]; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const act = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else if (r.message) toast.success(r.message);
      router.refresh();
    });
  const active = flags.filter((f) => !f.dismissed);
  const dismissed = flags.filter((f) => f.dismissed);
  return (
    <div className="space-y-2">
      {active
        .sort((a, b) => ["critical", "warning", "info"].indexOf(a.severity) - ["critical", "warning", "info"].indexOf(b.severity))
        .map((f) => {
          const s = STYLE[f.severity];
          return (
            <div key={f.code + f.message} className={cn("flex gap-3 rounded-xl border px-4 py-3", s.box)}>
              <s.icon className={cn("mt-0.5 h-4 w-4 shrink-0", s.text)} />
              <div className="min-w-0 flex-1 text-sm">
                <p className={cn(f.severity !== "info" && "font-medium", "text-ink")}>{f.message}</p>
                {canEdit && f.severity !== "info" ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {f.code === "duplicate" ? (
                      <>
                        <button disabled={pending} onClick={() => act(() => rejectAsDuplicateAction(invoiceId))} className="rounded-lg bg-danger px-2.5 py-1 text-xs font-medium text-white">
                          Afvis som dublet
                        </button>
                        <button disabled={pending} onClick={() => act(() => dismissFlagAction(invoiceId, f.code))} className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium">
                          Det er ikke en dublet
                        </button>
                      </>
                    ) : f.code === "bank_changed" ? (
                      <button disabled={pending} onClick={() => act(() => dismissFlagAction(invoiceId, f.code))} className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium">
                        Jeg har bekræftet det nye kontonummer hos leverandøren
                      </button>
                    ) : (
                      <button disabled={pending} onClick={() => act(() => dismissFlagAction(invoiceId, f.code))} className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium">
                        Det er i orden
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      {dismissed.length ? (
        <p className="flex items-center gap-1.5 px-1 text-xs text-muted">
          <CheckCircle2 className="h-3.5 w-3.5 text-success" /> {dismissed.length} advarsel{dismissed.length === 1 ? "" : "er"} er kontrolleret og godkendt
        </p>
      ) : null}
    </div>
  );
}
