"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw, X, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui";
import { connectBankAction, syncBankAction } from "./actions";

export function ConnectBank({ banks, live }: { banks: { id: string; name: string; color: string }[]; live: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Forbind bank
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setOpen(false)}>
          <div className="animate-in w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-pop" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Vælg din bank</h2>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1 hover:bg-surface-2" aria-label="Luk">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 flex items-center gap-1.5 text-sm text-muted">
              <ShieldCheck className="h-4 w-4 text-brand" />
              {live ? "Sikker forbindelse via PSD2 (Enable Banking). Du logger ind med MitID i din bank." : "Sandbox: forbindelsen simuleres – ingen rigtige data."}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {banks.map((b) => (
                <button
                  key={b.id}
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await connectBankAction(b.id);
                      if (!r.ok) return void toast.error(r.error);
                      window.location.href = r.data!.url;
                    })
                  }
                  className="flex items-center gap-2 rounded-xl border border-line px-3 py-3 text-left text-sm font-medium transition hover:border-brand hover:bg-brand-soft/40"
                >
                  <span className="h-6 w-6 shrink-0 rounded-md" style={{ background: b.color }} />
                  <span className="truncate">{b.name}</span>
                </button>
              ))}
            </div>
            {pending ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Sender dig til banken…
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

export function SyncButton() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await syncBankAction();
          if (!r.ok) return void toast.error(r.error);
          toast.success(r.message);
          router.refresh();
        })
      }
    >
      <RefreshCw className={pending ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Synkronisér
    </Button>
  );
}
