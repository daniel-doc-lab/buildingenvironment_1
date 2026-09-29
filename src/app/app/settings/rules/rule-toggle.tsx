"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toggleRuleAction, deleteRuleAction } from "../actions";

export function RuleToggle({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <span className="flex items-center gap-2">
      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={active}
          disabled={pending}
          onChange={(e) =>
            start(async () => {
              await toggleRuleAction(id, e.target.checked);
              router.refresh();
            })
          }
          className="accent-[var(--brand)]"
        />
        Aktiv
      </label>
      <button
        disabled={pending}
        onClick={() =>
          confirm("Slet reglen?") &&
          start(async () => {
            await deleteRuleAction(id);
            router.refresh();
          })
        }
        className="rounded-md p-1 text-muted hover:text-danger"
        aria-label="Slet regel"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </span>
  );
}
