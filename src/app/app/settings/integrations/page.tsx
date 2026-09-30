import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireCompany } from "@/server/auth";
import { aiFor } from "@/server/services/integrations";
import { Badge, Card } from "@/components/ui";
import { liveBankConfigured } from "@/integrations/bank";
import { economicConnectUrl } from "@/integrations/accounting/economic";
import { IntegrationCard, EconomicForm, BoligflowForm, AiForm, NemhandelForm } from "./integration-forms";
import { formatDateTime } from "@/lib/utils";
import { Landmark, BookOpen, Building2, Network, Sparkles, Mail } from "lucide-react";
import { headers } from "next/headers";

export const metadata: Metadata = { title: "Integrationer" };

export default async function IntegrationsPage() {
  const ctx = await requireCompany("manageIntegrations");
  const rows = await ctx.db.select().from(schema.integrations).where(eq(schema.integrations.companyId, ctx.company.id));
  const conns = await ctx.db.select().from(schema.bankConnections).where(eq(schema.bankConnections.companyId, ctx.company.id));
  const get = (p: string) => rows.find((r) => r.provider === p);
  const ai = await aiFor(ctx.db, ctx.company.id);
  const h = await headers();
  const origin = process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const economic = get("economic");
  const boligflow = get("boligflow");
  const nemhandel = get("nemhandel");
  const status = (r?: { status: string; mode: string; lastSyncAt: Date | null; lastError: string | null }) =>
    r ? (
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={r.lastError ? "danger" : "success"} dot>
          {r.lastError ? "Fejl" : "Forbundet"}
        </Badge>
        <Badge tone={r.mode === "live" ? "brand" : "neutral"}>{r.mode === "live" ? "Live" : "Sandbox"}</Badge>
        {r.lastSyncAt ? <span className="text-xs text-muted">Synk {formatDateTime(r.lastSyncAt)}</span> : null}
      </div>
    ) : (
      <Badge>Ikke forbundet</Badge>
    );

  return (
    <div className="space-y-4">
      <IntegrationCard
        icon={<Landmark className="h-5 w-5" />}
        title="Bank connect (PSD2)"
        description="Saldo, posteringer og betalinger direkte i jeres bank – Danske Bank, Nordea, Jyske Bank, Sydbank, Nykredit, Arbejdernes Landsbank, Bankdata/BEC-banker m.fl."
        status={
          <div className="flex flex-wrap items-center gap-2">
            {conns.filter((c) => c.status === "active").length ? <Badge tone="success" dot>{conns.filter((c) => c.status === "active").length} bank(er) forbundet</Badge> : <Badge>Ikke forbundet</Badge>}
            <Badge tone={liveBankConfigured() ? "brand" : "neutral"}>{liveBankConfigured() ? "Enable Banking (live)" : "Sandbox"}</Badge>
          </div>
        }
      >
        <p className="text-sm text-muted">
          Forbind og administrér banker under{" "}
          <Link href="/app/bank" className="font-medium text-brand hover:underline">
            Bank & afstemning
          </Link>
          . {liveBankConfigured() ? "" : "Live-adgang aktiveres med ENABLEBANKING_APP_ID og ENABLEBANKING_PRIVATE_KEY. Uden PSD2-aftale kan I altid bruge betalingsfiler (pain.001)."}
        </p>
      </IntegrationCard>

      <IntegrationCard
        icon={<BookOpen className="h-5 w-5" />}
        title="e-conomic"
        description="Henter kontoplan, momskoder, afdelinger og leverandører. Godkendte fakturaer bogføres automatisk i kassekladden med bilag vedhæftet, og betalinger registreres."
        status={status(economic)}
        error={economic?.lastError}
      >
        <EconomicForm connected={!!economic} mode={economic?.mode ?? "sandbox"} connectUrl={economicConnectUrl(`${origin}/api/integrations/economic`)} />
      </IntegrationCard>

      <IntegrationCard
        icon={<Building2 className="h-5 w-5" />}
        title="Boligflow"
        description="Ejendomme og lejemål synkroniseres, så AI kan kontere pr. ejendom. Godkendte udgifter sendes tilbage til Boligflow."
        status={status(boligflow)}
        error={boligflow?.lastError}
      >
        <BoligflowForm connected={!!boligflow} mode={boligflow?.mode ?? "sandbox"} />
      </IntegrationCard>

      <IntegrationCard
        icon={<Network className="h-5 w-5" />}
        title="NemHandel / Peppol e-fakturaer"
        description="Modtag OIOUBL- og Peppol BIS-fakturaer direkte – 100 % præcise data uden AI-aflæsning."
        status={status(nemhandel)}
      >
        <NemhandelForm connected={!!nemhandel} cvr={ctx.company.cvr} webhook={`${origin}/api/inbound/nemhandel?company=${ctx.company.slug}`} />
      </IntegrationCard>

      <IntegrationCard
        icon={<Mail className="h-5 w-5" />}
        title="E-mail-indbakke"
        description="Leverandører kan sende fakturaer direkte til jeres unikke adresse. PDF'er og billeder i mailen læses automatisk."
        status={<Badge tone="success" dot>Aktiv</Badge>}
      >
        <div className="space-y-2 text-sm">
          <p>
            Adresse: <span className="font-mono text-brand-ink">{ctx.company.slug}@indbakke.fluks.dk</span>
          </p>
          <p className="text-xs text-muted">
            Webhook til indgående mail (Postmark/Mailgun-format): <span className="font-mono">{origin}/api/inbound/email</span>
          </p>
        </div>
      </IntegrationCard>

      <IntegrationCard
        id="ai"
        icon={<Sparkles className="h-5 w-5" />}
        title="AI (Claude fra Anthropic)"
        description="Claude læser alle typer fakturaer – også fotos og scannede dokumenter – konterer ud fra jeres historik og svarer på spørgsmål i ⌘K-assistenten."
        status={
          <Badge tone={ai.status.live ? "brand" : "neutral"} dot>
            {ai.status.live ? `Claude aktiv (${ai.status.model})` : "Demo-AI (regelbaseret)"}
          </Badge>
        }
      >
        <AiForm connected={!!get("ai")} envKey={!!process.env.ANTHROPIC_API_KEY} />
      </IntegrationCard>
      <Card className="p-5 text-xs text-muted">
        Alle API-nøgler og tokens krypteres (AES-256-GCM) før de gemmes. Adgang til integrationer kræver rollen ejer, administrator eller bogholder.
      </Card>
    </div>
  );
}
