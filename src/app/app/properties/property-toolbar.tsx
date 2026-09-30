"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui";
import { syncPropertiesAction, importPropertiesCsvAction } from "./actions";

export function PropertyToolbar({ connected }: { connected: boolean }) {
  const [pending, start] = useTransition();
  const file = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      router.refresh();
    });
  return (
    <>
      <Button variant="secondary" disabled={pending} onClick={() => file.current?.click()} title="Kolonner: ejendom;adresse;postnr;by;lejemål;lejer;areal">
        <Upload className="h-4 w-4" /> Importér CSV
      </Button>
      <input
        ref={file}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const fd = new FormData();
          fd.set("file", f);
          run(() => importPropertiesCsvAction(fd));
        }}
      />
      {connected ? (
        <Button disabled={pending} onClick={() => run(syncPropertiesAction)}>
          <RefreshCw className={pending ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Synk Boligflow
        </Button>
      ) : null}
    </>
  );
}
