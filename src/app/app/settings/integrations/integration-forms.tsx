"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, Card, Field, Input } from "@/components/ui";
import {
  connectEconomicAction,
  syncEconomicAction,
  connectBoligflowAction,
  connectNemhandelAction,
  saveAiKeyAction,
  disconnectIntegrationAction,
} from "../actions";
import { syncPropertiesAction } from "../../properties/actions";

type R = { ok: boolean; error?: string; message?: string };
function useRun() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<R>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      if (r.message) toast.success(r.message);
      router.refresh();
    });
  return { pending, run };
}

export function IntegrationCard({
  id,
  icon,
  title,
  description,
  status,
  error,
  children,
}: {
  id?: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  status: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-24 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold">{title}</h2>
            {status}
          </div>
          <p className="mt-1 text-sm text-muted">{description}</p>
          {error ? <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p> : null}
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </Card>
  );
}

function ModeSwitch({ mode, setMode }: { mode: string; setMode: (m: string) => void }) {
  return (
    <div className="mb-3 inline-flex rounded-lg border border-line p-0.5 text-xs">
      {[
        ["sandbox", "Sandbox (demo)"],
        ["live", "Live"],
      ].map(([k, l]) => (
        <button key={k} type="button" onClick={() => setMode(k!)} className={`rounded-md px-3 py-1 ${mode === k ? "bg-brand text-white" : "text-muted"}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function EconomicForm({ connected, mode: initial, connectUrl }: { connected: boolean; mode: string; connectUrl: string | null }) {
  const [mode, setMode] = useState(initial);
  const { pending, run } = useRun();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("mode", mode);
        run(() => connectEconomicAction(fd));
      }}
    >
      <ModeSwitch mode={mode} setMode={setMode} />
      {mode === "live" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {connectUrl ? (
            <a href={connectUrl} className="sm:col-span-3 inline-flex h-9 items-center justify-center rounded-[10px] bg-[#0f5ec9] px-3 text-sm font-medium text-white">
              Forbind med e-conomic-login
            </a>
          ) : null}
          <Field label="Agreement Grant Token" className="sm:col-span-2" hint="Fra e-conomic → Indstillinger → Apps, eller via login-knappen">
            <Input name="grantToken" type="password" autoComplete="off" />
          </Field>
          <Field label="Kassekladde nr.">
            <Input name="journalNumber" defaultValue="1" />
          </Field>
          <Field label="App Secret Token (valgfri)" className="sm:col-span-3" hint="Kun hvis I bruger jeres egen e-conomic-app. Ellers bruges Fluks' app.">
            <Input name="appSecret" type="password" autoComplete="off" />
          </Field>
        </div>
      ) : (
        <p className="text-sm text-muted">Sandbox bruger en dansk standardkontoplan og simulerer bogføring med bilagsnumre.</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {connected ? "Gem og synkronisér" : "Forbind"}
        </Button>
        {connected ? (
          <>
            <Button type="button" variant="secondary" disabled={pending} onClick={() => run(syncEconomicAction)}>
              Synkronisér nu
            </Button>
            <Button type="button" variant="ghost" className="text-danger" disabled={pending} onClick={() => confirm("Afbryd e-conomic?") && run(() => disconnectIntegrationAction("economic"))}>
              Afbryd
            </Button>
          </>
        ) : null}
      </div>
    </form>
  );
}

export function BoligflowForm({ connected, mode: initial }: { connected: boolean; mode: string }) {
  const [mode, setMode] = useState(initial);
  const { pending, run } = useRun();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("mode", mode);
        run(() => connectBoligflowAction(fd));
      }}
    >
      <ModeSwitch mode={mode} setMode={setMode} />
      {mode === "live" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="API-nøgle" hint="Bestilles hos Boligflow (API-adgang er et tilkøb)">
            <Input name="apiKey" type="password" autoComplete="off" />
          </Field>
          <Field label="API-URL (valgfri)">
            <Input name="baseUrl" placeholder="https://api.boligflow.dk/v1" />
          </Field>
        </div>
      ) : (
        <p className="text-sm text-muted">Sandbox indlæser tre eksempelejendomme med lejemål. Alternativt kan I importere en CSV-eksport under Ejendomme.</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {connected ? "Gem og synkronisér" : "Forbind"}
        </Button>
        {connected ? (
          <>
            <Button type="button" variant="secondary" disabled={pending} onClick={() => run(syncPropertiesAction)}>
              Synkronisér nu
            </Button>
            <Button type="button" variant="ghost" className="text-danger" disabled={pending} onClick={() => confirm("Afbryd Boligflow?") && run(() => disconnectIntegrationAction("boligflow"))}>
              Afbryd
            </Button>
          </>
        ) : null}
      </div>
    </form>
  );
}

export function NemhandelForm({ connected, cvr, webhook }: { connected: boolean; cvr: string | null; webhook: string }) {
  const { pending, run } = useRun();
  return connected ? (
    <div className="space-y-2 text-sm">
      <p>
        Modtager på: <span className="font-mono">DK{cvr}</span> (NemHandel/Peppol endpoint 0184:{cvr})
      </p>
      <p className="text-xs text-muted">
        Webhook til jeres access point-udbyder: <span className="break-all font-mono">{webhook}</span>
      </p>
      <Button variant="ghost" size="sm" className="text-danger" disabled={pending} onClick={() => run(() => disconnectIntegrationAction("nemhandel"))}>
        Deaktivér
      </Button>
    </div>
  ) : (
    <Button disabled={pending} onClick={() => run(connectNemhandelAction)}>
      Aktivér e-fakturamodtagelse
    </Button>
  );
}

export function AiForm({ connected, envKey }: { connected: boolean; envKey: boolean }) {
  const { pending, run } = useRun();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => saveAiKeyAction(fd));
      }}
      className="space-y-3"
    >
      {envKey ? <p className="text-sm text-muted">En API-nøgle er sat for hele installationen (ANTHROPIC_API_KEY). I kan overstyre den med jeres egen nøgle.</p> : null}
      <Field label="Anthropic API-nøgle" hint="Opret en nøgle på console.anthropic.com → API Keys. Nøglen krypteres og vises aldrig igen.">
        <Input name="apiKey" type="password" placeholder={connected ? "•••••••••••• (gemt)" : "sk-ant-…"} autoComplete="off" />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {connected ? "Opdatér nøgle" : "Aktivér Claude"}
        </Button>
        {connected ? (
          <Button type="button" variant="ghost" className="text-danger" disabled={pending} onClick={() => run(() => disconnectIntegrationAction("ai"))}>
            Fjern nøgle
          </Button>
        ) : null}
      </div>
    </form>
  );
}
