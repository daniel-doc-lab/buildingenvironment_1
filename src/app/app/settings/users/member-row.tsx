"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Badge, Select } from "@/components/ui";
import { changeRoleAction, removeMemberAction, removeDelegationAction } from "../actions";
import { ROLE_LABELS_CLIENT } from "@/lib/roles";
import { ROLES, type Role } from "@/db/schema";

export function MemberRow({ user, role, canManage, isMe }: { user: { id: string; name: string; email: string; title: string | null }; role: Role; canManage: boolean; isMe: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      if (r.message) toast.success(r.message);
      router.refresh();
    });
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
      <Avatar name={user.name} className="h-8 w-8" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {user.name} {isMe ? <span className="text-xs text-muted">(dig)</span> : null}
        </p>
        <p className="truncate text-xs text-muted">
          {user.email}
          {user.title ? ` · ${user.title}` : ""}
        </p>
      </div>
      {canManage ? (
        <>
          <Select value={role} disabled={pending} onChange={(e) => run(() => changeRoleAction(user.id, e.target.value as Role))} className="h-8 w-48 text-xs" aria-label="Rolle">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS_CLIENT[r]}
              </option>
            ))}
          </Select>
          <button onClick={() => confirm(`Fjern ${user.name}?`) && run(() => removeMemberAction(user.id))} className="rounded-md p-1 text-muted hover:text-danger" aria-label="Fjern">
            <X className="h-4 w-4" />
          </button>
        </>
      ) : (
        <Badge>{ROLE_LABELS_CLIENT[role]}</Badge>
      )}
    </li>
  );
}

export function DelegationRow({ id, text, canRemove }: { id: string; text: string; canRemove: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <li className="flex items-center gap-3 px-5 py-3 text-sm">
      <span className="flex-1">{text}</span>
      {canRemove ? (
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              await removeDelegationAction(id);
              router.refresh();
            })
          }
          className="text-xs text-muted hover:text-danger"
        >
          Fjern
        </button>
      ) : null}
    </li>
  );
}
