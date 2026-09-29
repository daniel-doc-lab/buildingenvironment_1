"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Inbox,
  CheckCircle2,
  Send,
  Landmark,
  Building2,
  Users,
  Receipt,
  TrendingUp,
  BarChart3,
  Settings,
  ChevronsUpDown,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { switchCompanyAction } from "@/app/auth-actions";
import type { Role } from "@/db/schema";

type Counts = { review: number; approvals: number; toPay: number; unmatched: number };

const NAV = [
  { href: "/app", label: "Overblik", icon: LayoutDashboard, exact: true },
  { href: "/app/inbox", label: "Indbakke", icon: Inbox, count: "review" as const },
  { href: "/app/approvals", label: "Godkendelser", icon: CheckCircle2, count: "approvals" as const, highlight: true },
  { href: "/app/payments", label: "Betalinger", icon: Send, count: "toPay" as const },
  { href: "/app/bank", label: "Bank & afstemning", icon: Landmark, count: "unmatched" as const },
  { href: "/app/suppliers", label: "Leverandører", icon: Users },
  { href: "/app/properties", label: "Ejendomme", icon: Building2, property: true },
  { href: "/app/expenses", label: "Udlæg", icon: Receipt },
  { href: "/app/cashflow", label: "Likviditet", icon: TrendingUp },
  { href: "/app/reports", label: "Rapporter", icon: BarChart3 },
];

function isActive(path: string, href: string, exact?: boolean) {
  return exact ? path === href : path === href || path.startsWith(href + "/");
}

export function Sidebar({
  counts,
  role,
  propertyModule,
  company,
  companies,
}: {
  counts: Counts;
  role: Role;
  propertyModule: boolean;
  company: { id: string; name: string };
  companies: { id: string; name: string }[];
}) {
  const path = usePathname();
  const items = NAV.filter((n) => (n.property ? propertyModule : true)).filter((n) => (role === "member" ? ["/app", "/app/expenses", "/app/approvals"].includes(n.href) : true));
  return (
    <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-line bg-surface lg:flex">
      <div className="flex h-14 items-center px-5">
        <Link href="/app">
          <Logo />
        </Link>
      </div>
      <details className="group relative mx-3 mb-2">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl border border-line px-3 py-2 text-sm hover:bg-surface-2">
          <span className="truncate font-medium">{company.name}</span>
          <ChevronsUpDown className="h-4 w-4 text-muted" />
        </summary>
        <div className="absolute inset-x-0 top-full z-30 mt-1 rounded-xl border border-line bg-surface p-1 shadow-pop">
          {companies.map((c) => (
            <form key={c.id} action={switchCompanyAction}>
              <input type="hidden" name="companyId" value={c.id} />
              <button className={cn("w-full truncate rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2", c.id === company.id && "font-semibold text-brand")}>
                {c.name}
              </button>
            </form>
          ))}
          <Link href="/onboarding?new=1" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-ink">
            <Plus className="h-4 w-4" /> Tilføj virksomhed
          </Link>
        </div>
      </details>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {items.map((n) => {
          const active = isActive(path, n.href, n.exact);
          const count = n.count ? counts[n.count] : 0;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
                active ? "bg-brand-soft text-brand-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              <n.icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.2 : 1.8} />
              <span className="flex-1">{n.label}</span>
              {count > 0 ? (
                <span
                  className={cn(
                    "min-w-5 rounded-full px-1.5 py-px text-center text-[11px] font-semibold tabular",
                    n.highlight ? "bg-brand text-white" : "bg-surface-2 text-muted",
                  )}
                >
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-line p-3">
        <Link
          href="/app/settings"
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium",
            path.startsWith("/app/settings") ? "bg-brand-soft text-brand-ink" : "text-ink-2 hover:bg-surface-2",
          )}
        >
          <Settings className="h-[18px] w-[18px]" /> Indstillinger
        </Link>
      </div>
    </aside>
  );
}

export function MobileNav({ counts }: { counts: Counts }) {
  const path = usePathname();
  const items = [
    { href: "/app", label: "Overblik", icon: LayoutDashboard, exact: true },
    { href: "/app/inbox", label: "Indbakke", icon: Inbox, count: counts.review },
    { href: "/app/approvals", label: "Godkend", icon: CheckCircle2, count: counts.approvals },
    { href: "/app/payments", label: "Betal", icon: Send },
    { href: "/app/expenses", label: "Udlæg", icon: Receipt },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      {items.map((n) => {
        const active = isActive(path, n.href, n.exact);
        return (
          <Link key={n.href} href={n.href} className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[11px]", active ? "text-brand" : "text-muted")}>
            <n.icon className="h-5 w-5" />
            {n.label}
            {n.count ? (
              <span className="absolute right-[22%] top-1 min-w-4 rounded-full bg-brand px-1 text-center text-[10px] font-semibold text-white">{n.count}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
