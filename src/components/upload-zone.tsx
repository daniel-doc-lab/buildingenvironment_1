"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Camera, Loader2, FileText, Sparkles, ShieldAlert, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { uploadDocumentsAction, createSampleInvoiceAction } from "@/app/app/actions";
import { cn } from "@/lib/utils";

export function UploadZone({ autoOpen, demo, kind = "invoice", extra }: { autoOpen?: boolean; demo?: boolean; kind?: "invoice" | "expense"; extra?: React.ReactNode }) {
  const [drag, setDrag] = useState(false);
  const [pending, start] = useTransition();
  const [names, setNames] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (autoOpen) input.current?.click();
  }, [autoOpen]);

  function send(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    setNames(list.map((f) => f.name));
    const fd = new FormData(formRef.current ?? undefined);
    fd.delete("files");
    for (const f of list) fd.append("files", f);
    fd.set("kind", kind);
    start(async () => {
      const r = await uploadDocumentsAction(fd);
      setNames([]);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "Læst", { description: "AI har aflæst, konteret og kontrolleret dokumentet." });
      if (r.data?.ids.length === 1) router.push(`/app/invoices/${r.data.ids[0]}`);
      else router.refresh();
    });
  }

  function sample(k: "normal" | "new" | "fraud") {
    start(async () => {
      const r = await createSampleInvoiceAction(k);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      router.push(`/app/invoices/${r.data!.id}`);
    });
  }

  return (
    <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          send(e.dataTransfer.files);
        }}
        className={cn(
          "relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-7 text-center transition",
          drag ? "border-brand bg-brand-soft/60" : "border-line-strong bg-surface hover:border-brand/60",
        )}
      >
        {pending ? (
          <div className="flex flex-col items-center gap-2 py-2">
            <Loader2 className="h-7 w-7 animate-spin text-brand" />
            <p className="text-sm font-medium">AI læser {names.length > 1 ? `${names.length} dokumenter` : "dokumentet"}…</p>
            <p className="flex items-center gap-1 text-xs text-muted">
              <FileText className="h-3.5 w-3.5" /> {names[0] ?? "eksempelfaktura"}
            </p>
          </div>
        ) : (
          <>
            <span className="rounded-2xl bg-brand-soft p-3 text-brand">
              <UploadCloud className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm font-medium">
                Træk {kind === "expense" ? "kvitteringer" : "fakturaer"} hertil eller{" "}
                <button type="button" onClick={() => input.current?.click()} className="text-brand underline-offset-2 hover:underline">
                  vælg filer
                </button>
              </p>
              <p className="mt-0.5 text-xs text-muted">PDF, billeder og e-fakturaer (OIOUBL/Peppol XML) · flere filer ad gangen</p>
            </div>
            <button
              type="button"
              onClick={() => camera.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-surface-2 sm:hidden"
            >
              <Camera className="h-4 w-4" /> Tag billede
            </button>
            {extra}
          </>
        )}
        <input ref={input} type="file" multiple hidden accept="application/pdf,image/*,.xml" onChange={(e) => e.target.files && send(e.target.files)} />
        <input ref={camera} type="file" hidden accept="image/*" capture="environment" onChange={(e) => e.target.files && send(e.target.files)} />
      </div>
      {demo && kind === "invoice" ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          <Sparkles className="h-3.5 w-3.5 text-brand" /> Prøv med en eksempelfaktura:
          <button type="button" disabled={pending} onClick={() => sample("normal")} className="rounded-full border border-line bg-surface px-2.5 py-1 hover:border-brand hover:text-brand">
            Kendt leverandør
          </button>
          <button type="button" disabled={pending} onClick={() => sample("new")} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 hover:border-brand hover:text-brand">
            <UserPlus className="h-3 w-3" /> Ny leverandør
          </button>
          <button type="button" disabled={pending} onClick={() => sample("fraud")} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 hover:border-danger hover:text-danger">
            <ShieldAlert className="h-3 w-3" /> Svindelforsøg
          </button>
        </div>
      ) : null}
    </form>
  );
}
