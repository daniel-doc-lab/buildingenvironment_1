import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { getContext } from "@/server/auth";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui";
import { NewCompanyForm, FinishButton } from "./onboarding-client";
import { Landmark, BookOpen, Building2, Users, Mail, Check, Sparkles } from "lucide-react";

export const metadata: Metadata = { title: "Kom i gang" };

export default async function Onboarding(props: PageProps<"/onboarding">) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  const sp = await props.searchParams;
  if (sp.new === "1" || !ctx.company) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6">
        <Logo className="mb-8" />
        <Card className="w-full max-w-md p-8">
          <h1 className="text-xl font-semibold">Tilføj virksomhed</h1>
          <p className="mt-1 text-sm text-muted">Perfekt til bogholdere og administratorer med flere selskaber.</p>
          <NewCompanyForm />
        </Card>
      </div>
    );
  }
  const c = ctx.company;
  const [bank, integ, members] = await Promise.all([
    ctx.db.select().from(schema.bankConnections).where(eq(schema.bankConnections.companyId, c.id)),
    ctx.db.select().from(schema.integrations).where(eq(schema.integrations.companyId, c.id)),
    ctx.db.select().from(schema.memberships).where(eq(schema.memberships.companyId, c.id)),
  ]);
  const has = (p: string) => integ.some((i) => i.provider === p);
  const steps = [
    { done: bank.some((b) => b.status === "active"), icon: Landmark, title: "Forbind jeres bank", text: "Log ind med MitID, så Fluks kan betale fakturaer og afstemme automatisk.", href: "/app/bank", cta: "Forbind bank" },
    { done: has("economic"), icon: BookOpen, title: "Forbind e-conomic", text: "Hent kontoplan og leverandører. Godkendte fakturaer bogføres automatisk.", href: "/app/settings/integrations", cta: "Forbind" },
    { done: has("boligflow") || !!c.settings.propertyModule, icon: Building2, title: "Ejendomme (valgfrit)", text: "Administrerer I ejendomme? Forbind Boligflow og kontér pr. ejendom og lejemål.", href: "/app/settings/integrations", cta: "Opsæt" },
    { done: members.length > 1, icon: Users, title: "Invitér godkendere", text: "Tilføj kolleger, der skal godkende fakturaer – de kan godkende fra mobilen.", href: "/app/settings/users", cta: "Invitér" },
    { done: false, icon: Mail, title: "Send fakturaer til Fluks", text: `Bed leverandører sende til ${c.slug}@indbakke.fluks.dk – eller upload den første faktura nu.`, href: "/app/inbox?upload=1", cta: "Upload faktura" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Logo className="mb-8" />
      <h1 className="text-2xl font-semibold tracking-tight">Velkommen, {ctx.user.name.split(" ")[0]} 👋</h1>
      <p className="mt-1 text-sm text-muted">
        {c.name} er oprettet. Fem hurtige trin, så kører fakturahåndteringen af sig selv. ({doneCount}/{steps.length})
      </p>
      <div className="mt-6 space-y-3">
        {steps.map((s) => (
          <Card key={s.title} className="flex items-center gap-4 p-4">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${s.done ? "bg-success text-white" : "bg-brand-soft text-brand"}`}>
              {s.done ? <Check className="h-5 w-5" /> : <s.icon className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{s.title}</p>
              <p className="text-sm text-muted">{s.text}</p>
            </div>
            {!s.done ? (
              <Link href={s.href} className="shrink-0 rounded-[10px] border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface-2">
                {s.cta}
              </Link>
            ) : null}
          </Card>
        ))}
      </div>
      <div className="mt-6 flex items-center justify-between rounded-2xl bg-brand-soft/60 px-5 py-4 text-sm">
        <span className="flex items-center gap-2 text-brand-ink">
          <Sparkles className="h-4 w-4" /> Du kan altid springe over og gøre det senere.
        </span>
        <FinishButton />
      </div>
    </div>
  );
}
