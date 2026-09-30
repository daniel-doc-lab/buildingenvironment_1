"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, FileDown, UserCheck, Ban, CheckCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button, Card } from "@/components/ui";
import { approveBatchAction, signBatchAction, cancelBatchAction, markFileBatchCompletedAction } from "../../actions";

export function BatchActions({
  batch,
  userId,
  canSign,
  canPay,
}: {
  batch: { id: string; status: string; method: string; fileId: string | null; createdBy: string | null };
  userId: string;
  canSign: boolean;
  canPay: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      if (r.message) toast.success(r.message);
      router.refresh();
    });
  const cancellable = ["draft", "awaiting_second_approval", "awaiting_signature"].includes(batch.status);
  return (
    <Card className="space-y-3 p-5">
      <p className="text-sm font-medium">Handlinger</p>
      {batch.status === "awaiting_second_approval" ? (
        batch.createdBy === userId ? (
          <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
            Beløbet overstiger 4-øjne-grænsen. En anden person med betalingsrettigheder skal godkende batchen. Vi har givet dem besked.
          </p>
        ) : canPay ? (
          <Button className="w-full" disabled={pending} onClick={() => run(() => approveBatchAction(batch.id))}>
            <UserCheck className="h-4 w-4" /> Godkend som 2. person
          </Button>
        ) : null
      ) : null}
      {batch.status === "awaiting_signature" ? (
        canSign ? (
          <Button
            className="w-full"
            size="lg"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await signBatchAction(batch.id);
                if (!r.ok) return void toast.error(r.error);
                window.location.href = r.data!.url;
              })
            }
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Underskriv med MitID
          </Button>
        ) : (
          <p className="text-xs text-muted">En ejer eller administrator skal underskrive betalingerne.</p>
        )
      ) : null}
      {batch.fileId ? (
        <a href={`/api/files/${batch.fileId}?download`} className="flex h-9 w-full items-center justify-center gap-2 rounded-[10px] border border-line bg-surface text-sm font-medium hover:bg-surface-2">
          <FileDown className="h-4 w-4" /> Hent betalingsfil (pain.001)
        </a>
      ) : null}
      {batch.status === "exported" && canPay ? (
        <>
          <p className="text-xs text-muted">Upload filen i netbanken under &quot;Importér betalinger&quot;. Fluks afstemmer automatisk, når betalingerne ses på kontoen – eller markér dem manuelt.</p>
          <Button variant="secondary" className="w-full" disabled={pending} onClick={() => run(() => markFileBatchCompletedAction(batch.id))}>
            <CheckCheck className="h-4 w-4" /> Markér som betalt
          </Button>
        </>
      ) : null}
      {cancellable && canPay ? (
        <Button variant="ghost" className="w-full text-danger" disabled={pending} onClick={() => confirm("Annullér batchen?") && run(() => cancelBatchAction(batch.id))}>
          <Ban className="h-4 w-4" /> Annullér batch
        </Button>
      ) : null}
      {["submitted", "completed"].includes(batch.status) ? <p className="text-xs text-muted">Batchen er sendt til banken og kan ikke længere ændres.</p> : null}
    </Card>
  );
}
