"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building, Users, GitBranch, Wand2, Plug, Bell, ScrollText, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/db/schema";

const ITEMS = [
  { href: "/app/settings", label: "Virksomhed", icon: Building, roles: ["owner", "admin", "accountant", "auditor"] },
  { href: "/app/settings/users", label: "Brugere & roller", icon: Users, roles: ["owner", "admin", "accountant", "approver", "auditor"] },
  { href: "/app/settings/workflows", label: "Godkendelsesflows", icon: GitBranch, roles: ["owner", "admin", "accountant", "auditor"] },
  { href: "/app/settings/rules", label: "Konteringsregler", icon: Wand2, roles: ["owner", "admin", "accountant", "auditor"] },
  { href: "/app/settings/integrations", label: "Integrationer", icon: Plug, roles: ["owner", "admin", "accountant"] },
  { href: "/app/settings/notifications", label: "E-mails", icon: Bell, roles: ["owner", "admin", "accountant"] },
  { href: "/app/settings/audit", label: "Revisionslog", icon: ScrollText, roles: ["owner", "admin", "accountant", "auditor"] },
  { href: "/app/settings/profile", label: "Min profil", icon: UserCircle, roles: ["owner", "admin", "accountant", "approver", "member", "auditor"] },
];

export function SettingsNav({ role }: { role: Role }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col scrollbar-thin">
      {ITEMS.filter((i) => i.roles.includes(role)).map((i) => {
        const active = i.href === "/app/settings" ? path === i.href : path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={cn("flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium", active ? "bg-surface text-ink shadow-card ring-1 ring-line" : "text-muted hover:text-ink")}
          >
            <i.icon className="h-4 w-4" /> {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
