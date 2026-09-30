import { requireCompany } from "@/server/auth";
import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout({ children }: LayoutProps<"/app/settings">) {
  const ctx = await requireCompany();
  return (
    <div className="animate-in">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Indstillinger</h1>
      <p className="mb-6 text-sm text-muted">{ctx.company.name}</p>
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <SettingsNav role={ctx.role} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
