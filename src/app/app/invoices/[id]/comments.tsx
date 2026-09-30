"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { addCommentAction } from "../../actions";
import { Avatar, Card, CardHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export function Comments({ invoiceId, comments, members }: { invoiceId: string; comments: { id: string; body: string; name: string; createdAt: string }[]; members: string[] }) {
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-muted" /> Kommentarer</span>} description={`Nævn en kollega med @, fx @${members[0] ?? "navn"}`} />
      {comments.length ? (
        <ul className="space-y-3 px-5 py-4">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              <Avatar name={c.name} />
              <div className="min-w-0 flex-1 rounded-xl bg-surface-2 px-3 py-2">
                <p className="text-xs">
                  <span className="font-medium">{c.name}</span> <span className="text-muted">{formatDateTime(c.createdAt)}</span>
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="flex gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await addCommentAction(invoiceId, body);
            if (!r.ok) return void toast.error(r.error);
            setBody("");
            router.refresh();
          });
        }}
      >
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Skriv en kommentar…"
          className="h-9 flex-1 rounded-[10px] border border-line bg-surface px-3 text-sm outline-none focus:border-brand"
        />
        <button disabled={pending || !body.trim()} className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-brand text-white disabled:opacity-40" aria-label="Send">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </Card>
  );
}
