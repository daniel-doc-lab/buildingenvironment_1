"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";

export function SearchBox({ placeholder, param = "q" }: { placeholder: string; param?: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [v, setV] = useState(sp.get(param) ?? "");
  useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get(param) ?? "") === v) return;
      const next = new URLSearchParams(sp.toString());
      if (v) next.set(param, v);
      else next.delete(param);
      router.replace(`${path}?${next.toString()}`);
    }, 250);
    return () => clearTimeout(t);
  }, [v, sp, param, path, router]);
  return (
    <label className="relative mb-4 block w-full sm:w-72">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-[10px] border border-line bg-surface pl-9 pr-3 text-sm shadow-card outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)]"
      />
    </label>
  );
}
