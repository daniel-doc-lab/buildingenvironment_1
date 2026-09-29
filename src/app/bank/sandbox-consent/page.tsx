import { MitIdBox } from "../mitid-box";

export default async function SandboxConsent(props: PageProps<"/bank/sandbox-consent">) {
  const sp = await props.searchParams;
  const state = String(sp.state ?? "");
  const bank = String(sp.bank ?? "Banken");
  const redirect = String(sp.redirect ?? "/api/bank/callback");
  const target = new URL(redirect, "http://x");
  const ok = `${target.pathname}?state=${encodeURIComponent(state)}&code=${encodeURIComponent(state.slice(-10))}`;
  const cancel = `${target.pathname}?state=${encodeURIComponent(state)}&error=cancelled`;
  return (
    <MitIdBox
      bank={bank}
      title="Giv Fluks adgang til dine konti"
      lines={["Se kontooplysninger og saldo", "Se posteringer (op til 90 dage tilbage)", "Igangsætte betalinger, som du selv godkender", "Samtykket gælder i 180 dage og kan tilbagekaldes"]}
      approveLabel="Giv samtykke"
      approveHref={ok}
      cancelHref={cancel}
    />
  );
}
