"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, Field, Select, Textarea } from "@/components/ui";
import { uploadDocumentsAction } from "../actions";

export function ExpenseUpload({ properties, autoOpen }: { properties: { id: string; name: string }[]; autoOpen?: boolean }) {
  const [pending, start] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const cam = useRef<HTMLInputElement>(null);
  const pick = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (autoOpen) cam.current?.click();
  }, [autoOpen]);
  function choose(f?: File) {
    if (!f) return;
    setFile(f);
    setPreview(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  }
  return (
    <Card className="p-5">
      <form
        ref={form}
        onSubmit={(e) => {
          e.preventDefault();
          if (!file) return void toast.error("Vælg eller tag et billede af kvitteringen");
          const fd = new FormData(form.current!);
          fd.set("files", file);
          fd.set("kind", "expense");
          fd.set("source", "mobile");
          start(async () => {
            const r = await uploadDocumentsAction(fd);
            if (!r.ok) return void toast.error(r.error);
            toast.success("Udlæg indsendt til godkendelse");
            setFile(null);
            setPreview(null);
            form.current?.reset();
            router.refresh();
          });
        }}
        className="space-y-4"
      >
        <p className="font-medium">Nyt udlæg</p>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Kvittering" className="max-h-56 w-full rounded-xl object-contain bg-surface-2" />
        ) : file ? (
          <p className="rounded-xl bg-surface-2 px-3 py-6 text-center text-sm">{file.name}</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => cam.current?.click()} className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong py-6 text-sm hover:border-brand hover:text-brand">
              <Camera className="h-6 w-6" /> Tag billede
            </button>
            <button type="button" onClick={() => pick.current?.click()} className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong py-6 text-sm hover:border-brand hover:text-brand">
              <Upload className="h-6 w-6" /> Vælg fil
            </button>
          </div>
        )}
        <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => choose(e.target.files?.[0])} />
        <input ref={pick} type="file" accept="image/*,application/pdf" hidden onChange={(e) => choose(e.target.files?.[0])} />
        {properties.length ? (
          <Field label="Ejendom (valgfrit)">
            <Select name="propertyId" defaultValue="">
              <option value="">Ingen</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Hvad var det til? (valgfrit)">
          <Textarea name="note" placeholder="Fx pærer til opgangen i nr. 18" />
        </Field>
        <Button type="submit" className="w-full" disabled={pending || !file}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {pending ? "AI læser kvitteringen…" : "Indsend udlæg"}
        </Button>
      </form>
    </Card>
  );
}
