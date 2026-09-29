import { requireCompany } from "@/server/auth";
import { navCounts, recentNotifications } from "@/server/queries";
import { Sidebar, MobileNav } from "@/components/shell/nav";
import { Topbar } from "@/components/shell/topbar";
import { CommandPalette } from "@/components/shell/command-palette";
import { aiFor } from "@/server/services/integrations";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const ctx = await requireCompany();
  const [counts, notes, ai] = await Promise.all([
    navCounts(ctx.db, ctx.company.id, ctx.user.id),
    recentNotifications(ctx.db, ctx.company.id, ctx.user.id),
    aiFor(ctx.db, ctx.company.id),
  ]);
  return (
    <div className="flex min-h-screen">
      <Sidebar
        counts={counts}
        role={ctx.role}
        propertyModule={!!ctx.company.settings.propertyModule}
        company={{ id: ctx.company.id, name: ctx.company.name }}
        companies={ctx.companies.map((c) => ({ id: c.id, name: c.name }))}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
        <Topbar
          user={{ name: ctx.user.name, email: ctx.user.email }}
          role={ctx.role}
          companyName={ctx.company.name}
          isDemo={ctx.company.isDemo}
          ai={ai.status}
          notifications={notes.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, read: !!n.readAt, createdAt: n.createdAt.toISOString() }))}
          unread={counts.unread}
        />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12">{children}</main>
      </div>
      <MobileNav counts={counts} />
      <CommandPalette aiLabel={ai.status.label} />
    </div>
  );
}
