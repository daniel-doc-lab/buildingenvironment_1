"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Bell, Search, Sparkles, LogOut, User2, Upload } from "lucide-react";
import { logoutAction } from "@/app/auth-actions";
import { markNotificationsReadAction } from "@/app/app/actions";
import { Avatar, Kbd } from "@/components/ui";
import { Logo } from "@/components/logo";
import { cn, formatDateTime } from "@/lib/utils";
import { ROLE_LABELS_CLIENT } from "@/lib/roles";
import type { Role } from "@/db/schema";

type Note = { id: string; title: string; body: string | null; link: string | null; read: boolean; createdAt: string };

export function Topbar({
  user,
  role,
  companyName,
  isDemo,
  ai,
  notifications,
  unread,
}: {
  user: { name: string; email: string };
  role: Role;
  companyName: string;
  isDemo: boolean;
  ai: { live: boolean; label: string; model: string | null };
  notifications: Note[];
  unread: number;
}) {
  const [, start] = useTransition();
  return (
    <>
      {isDemo ? (
        <div className="bg-ink px-4 py-1.5 text-center text-xs text-white/85">
          Du bruger demovirksomheden <span className="font-semibold text-white">{companyName}</span> – alle banker og integrationer kører i sandbox.{" "}
          <Link href="/signup" className="font-semibold text-accent underline-offset-2 hover:underline">
            Opret din egen virksomhed →
          </Link>
        </div>
      ) : null}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur sm:px-6 lg:px-8">
        <Link href="/app" className="lg:hidden">
          <Logo mark />
        </Link>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("fluks:palette"))}
          className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm text-muted shadow-card transition hover:border-line-strong sm:max-w-md"
        >
          <Search className="h-4 w-4" />
          <span className="min-w-0 flex-1 truncate text-left"><span className="sm:hidden">Søg eller spørg AI</span><span className="hidden sm:inline">Søg eller spørg AI – fx &quot;hvad forfalder i denne uge?&quot;</span></span>
          <span className="hidden sm:inline-flex">
            <Kbd>⌘K</Kbd>
          </span>
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/app/inbox?upload=1"
            className="hidden h-9 items-center gap-2 rounded-xl bg-brand px-3 text-sm font-medium text-white shadow-card hover:bg-brand-hover sm:inline-flex"
          >
            <Upload className="h-4 w-4" /> Upload
          </Link>
          <Link
            href="/app/settings/integrations#ai"
            title={ai.live ? `Claude (${ai.model}) er aktiv` : "Demo-AI er aktiv. Tilføj en Claude API-nøgle for fuld billedgenkendelse."}
            className={cn(
              "hidden h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-medium md:inline-flex",
              ai.live ? "border-brand/30 bg-brand-soft text-brand-ink" : "border-line bg-surface text-muted",
            )}
          >
            <Sparkles className="h-3.5 w-3.5" /> {ai.label}
          </Link>
          <details className="relative">
            <summary
              className="relative flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-xl text-ink-2 hover:bg-surface-2"
              onClick={() => unread && start(() => markNotificationsReadAction())}
              aria-label="Notifikationer"
            >
              <Bell className="h-[18px] w-[18px]" />
              {unread > 0 ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger ring-2 ring-bg" /> : null}
            </summary>
            <div className="absolute right-0 z-40 mt-2 w-[340px] max-w-[90vw] rounded-2xl border border-line bg-surface p-2 shadow-pop">
              <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Notifikationer</p>
              {notifications.length === 0 ? <p className="px-2 py-6 text-center text-sm text-muted">Ingen notifikationer</p> : null}
              <div className="max-h-96 overflow-y-auto">
                {notifications.map((n) => (
                  <Link key={n.id} href={n.link ?? "#"} className="block rounded-xl px-2 py-2 hover:bg-surface-2">
                    <div className="flex items-start gap-2">
                      {!n.read ? <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" /> : <span className="w-1.5" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-snug">{n.title}</p>
                        {n.body ? <p className="mt-0.5 line-clamp-2 text-xs text-muted">{n.body}</p> : null}
                        <p className="mt-0.5 text-[11px] text-muted">{formatDateTime(n.createdAt)}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </details>
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center rounded-full p-0.5 hover:ring-2 hover:ring-line">
              <Avatar name={user.name} className="h-8 w-8" />
            </summary>
            <div className="absolute right-0 z-40 mt-2 w-64 rounded-2xl border border-line bg-surface p-2 shadow-pop">
              <div className="px-2 py-2">
                <p className="text-sm font-semibold">{user.name}</p>
                <p className="text-xs text-muted">{user.email}</p>
                <p className="mt-1 text-xs text-muted">{ROLE_LABELS_CLIENT[role]}</p>
              </div>
              <Link href="/app/settings/profile" className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-surface-2">
                <User2 className="h-4 w-4" /> Min profil
              </Link>
              <form action={logoutAction}>
                <button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-danger hover:bg-danger-soft">
                  <LogOut className="h-4 w-4" /> Log ud
                </button>
              </form>
            </div>
          </details>
        </div>
      </header>
    </>
  );
}
