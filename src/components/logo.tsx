import { cn } from "@/lib/utils";

export function Logo({ className, mark = false }: { className?: string; mark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight text-ink", className)}>
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
        <rect width="32" height="32" rx="9" fill="var(--brand)" />
        <path d="M10 22.5V10.5c0-.8.7-1.5 1.5-1.5H22" stroke="white" strokeWidth="2.6" strokeLinecap="round" fill="none" />
        <path d="M10 16h8" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="22.5" cy="21.5" r="2.2" fill="var(--accent)" />
      </svg>
      {mark ? null : <span className="text-[19px]">fluks</span>}
    </span>
  );
}
