import Link from "next/link";
import {
  Sparkles,
  ShieldCheck,
  Landmark,
  Zap,
  Building2,
  Smartphone,
  BookOpen,
  Network,
  Mail,
  Check,
  ArrowRight,
  Receipt,
  TrendingUp,
  GitBranch,
  ScanLine,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { demoLoginAction } from "./auth-actions";
import { PendingButton } from "@/components/pending-button";

const FEATURES = [
  { icon: ScanLine, title: "AI-aflæsning på sekunder", text: "PDF, foto, e-mail eller NemHandel. AI læser leverandør, beløb, moms, FI-kort og linjer – med sikkerhed pr. felt, så du kun tjekker det, der er i tvivl." },
  { icon: Sparkles, title: "Kontering der lærer", text: "Forslår konto, moms og ejendom ud fra jeres egen historik. Hver gang du retter, bliver den klogere – og laver selv regler." },
  { icon: ShieldCheck, title: "Stopper svindel før betaling", text: "Opdager ændrede kontonumre, dubletter, prisudsving og nye leverandører med store beløb – før pengene forlader kontoen." },
  { icon: GitBranch, title: "Godkendelse efter jeres regler", text: "Flere trin, beløbsgrænser, pr. ejendom eller leverandør. Stedfortrædere under ferie og automatiske påmindelser." },
  { icon: Landmark, title: "Betal fra jeres egen bank", text: "Bank connect til danske banker. Samlet betaling med MitID, 4-øjne-princip og betaling præcis på forfaldsdagen – eller før kontantrabatten udløber." },
  { icon: Zap, title: "Automatisk afstemning", text: "Posteringer hentes fra banken og matches med fakturaerne. Betalt, bogført og afstemt – uden at du rører det." },
  { icon: Building2, title: "Bygget til ejendomme", text: "Boligflow-integration, kontering pr. ejendom og lejemål, budget vs. forbrug og udlæg fra viceværten." },
  { icon: TrendingUp, title: "Likviditet i realtid", text: "Se saldoen de næste 90 dage med planlagte betalinger, fakturaer på vej og tilbagevendende regninger." },
  { icon: Smartphone, title: "Godkend fra mobilen", text: "Installér som app, godkend med ét tryk, eller tag et billede af en kvittering – AI klarer resten." },
];

const STEPS = [
  { n: "1", title: "Modtag", text: "Fakturaer kommer ind via mail, NemHandel eller upload." },
  { n: "2", title: "Forstå", text: "AI aflæser, konterer og kontrollerer for fejl og svindel." },
  { n: "3", title: "Godkend", text: "De rigtige personer godkender – også fra mobilen." },
  { n: "4", title: "Betal & bogfør", text: "Betales på forfaldsdagen, afstemmes og bogføres automatisk." },
];

const PLANS = [
  { name: "Start", price: "299", desc: "Til den lille virksomhed", items: ["Op til 40 bilag/md.", "AI-aflæsning og kontering", "Bank connect og betalingsfiler", "e-conomic, 3 brugere"] },
  { name: "Vækst", price: "699", desc: "Mest populære", featured: true, items: ["Op til 250 bilag/md.", "Godkendelsesflows i flere trin", "Svindelkontrol og 4-øjne", "Udlæg, likviditet og rapporter", "Ubegrænsede brugere"] },
  { name: "Ejendom", price: "1.299", desc: "Til administratorer", items: ["Ubegrænsede bilag", "Boligflow-integration", "Kontering pr. ejendom og lejemål", "Budgetopfølgning pr. ejendom", "Flere selskaber i én konto"] },
];

const FAQ = [
  ["Hvilke banker understøtter I?", "Alle større danske banker via PSD2 (bl.a. Danske Bank, Nordea, Jyske Bank, Sydbank, Nykredit, Arbejdernes Landsbank og Bankdata/BEC-banker). Uden bank connect kan I altid hente en betalingsfil (ISO 20022), som importeres i netbanken."],
  ["Hvad sker der, hvis AI tager fejl?", "Hvert felt har en sikkerhedsscore, og usikre felter markeres. Du retter på et øjeblik, og AI lærer af rettelsen. Intet betales uden godkendelse."],
  ["Hvordan beskytter I mod svindel?", "Vi sammenligner betalingsoplysninger med leverandørens historik. Ændres et kontonummer, stoppes fakturaen, indtil nogen har bekræftet det hos leverandøren. Store betalinger kræver to personer."],
  ["Er det lovligt i forhold til bogføringsloven?", "Ja. Bilag opbevares digitalt, alle handlinger logges i et revisionsspor, og data eksporteres til jeres regnskabsprogram."],
  ["Kan min revisor få adgang?", "Ja – med rollen Revisor får de læseadgang til alt, uden at kunne ændre noget."],
];

export default function Landing() {
  return (
    <div className="bg-surface">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Logo />
          <nav className="hidden gap-6 text-sm text-muted md:flex">
            <a href="#funktioner" className="hover:text-ink">
              Funktioner
            </a>
            <a href="#ejendomme" className="hover:text-ink">
              Ejendomme
            </a>
            <a href="#priser" className="hover:text-ink">
              Priser
            </a>
            <a href="#faq" className="hover:text-ink">
              Spørgsmål
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/login" className="hidden h-9 items-center rounded-[10px] px-3 text-sm font-medium text-ink-2 hover:bg-surface-2 sm:inline-flex">
              Log ind
            </Link>
            <Link href="/signup" className="inline-flex h-9 items-center rounded-[10px] bg-brand px-4 text-sm font-medium text-white hover:bg-brand-hover">
              Prøv gratis
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_70%_0%,var(--brand-soft),transparent)]" />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-2 lg:pt-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand-soft px-3 py-1 text-xs font-medium text-brand-ink">
              <Sparkles className="h-3.5 w-3.5" /> Faktura- og betalingsplatform med AI
            </span>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl">
              Fakturaer betalt.
              <br />
              <span className="text-brand">Fluks.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-ink-2">
              Fluks modtager, aflæser, konterer, kontrollerer og betaler jeres leverandørfakturaer – direkte fra jeres danske bank og bogført i e-conomic. I godkender bare.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <form action={demoLoginAction}>
                <input type="hidden" name="as" value="demo@fluks.dk" />
                <PendingButton
                  pendingLabel="Åbner demoen…"
                  className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand px-6 text-[15px] font-semibold text-white shadow-card hover:bg-brand-hover disabled:opacity-80"
                >
                  Prøv demoen nu <ArrowRight className="h-4 w-4" />
                </PendingButton>
              </form>
              <Link href="/signup" className="inline-flex h-12 items-center rounded-xl border border-line-strong bg-surface px-6 text-[15px] font-semibold hover:bg-surface-2">
                Opret konto gratis
              </Link>
            </div>
            <p className="mt-4 text-sm text-muted">Ingen installation · 30 dage gratis · Data i EU</p>
          </div>

          {/* Produktillustration */}
          <div className="relative">
            <div className="rounded-3xl border border-line bg-bg p-4 shadow-pop">
              <div className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted">Til godkendelse</p>
                    <p className="text-lg font-semibold">Lysgaard Energi A/S</p>
                  </div>
                  <p className="text-xl font-semibold tabular">3.672,80 kr.</p>
                </div>
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-brand-soft px-3 py-2 text-xs text-brand-ink">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Elforbrug fællesarealer, Fælledvej 18. Konteret på 3110 som de seneste 18 fakturaer · 97 % sikker
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <span className="flex h-10 items-center justify-center rounded-xl border border-line text-sm">Afvis</span>
                  <span className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-brand text-sm font-medium text-white">
                    <Check className="h-4 w-4" /> Godkend
                  </span>
                </div>
              </div>
              <div className="mt-3 rounded-2xl border border-danger/30 bg-danger-soft p-4 text-sm">
                <p className="flex items-center gap-2 font-medium text-danger">
                  <ShieldCheck className="h-4 w-4" /> Betaling stoppet
                </p>
                <p className="mt-1 text-xs text-ink-2">Hansen &amp; Søn VVS har skiftet kontonummer siden sidste betaling. Bekræft hos leverandøren før godkendelse.</p>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[
                  ["92 %", "automatiseret"],
                  ["0", "for sene betalinger"],
                  ["4 sek.", "pr. faktura"],
                ].map(([v, l]) => (
                  <div key={l} className="rounded-2xl border border-line bg-surface p-3">
                    <p className="text-lg font-semibold tabular">{v}</p>
                    <p className="text-[11px] text-muted">{l}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-bg">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-4 py-6 text-sm text-muted sm:px-6">
          <span className="flex items-center gap-2">
            <Landmark className="h-4 w-4" /> Danske banker via PSD2
          </span>
          <span className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> e-conomic
          </span>
          <span className="flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Boligflow
          </span>
          <span className="flex items-center gap-2">
            <Network className="h-4 w-4" /> NemHandel &amp; Peppol
          </span>
          <span className="flex items-center gap-2">
            <Mail className="h-4 w-4" /> E-mail-indbakke
          </span>
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Claude AI
          </span>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-center text-3xl font-semibold tracking-tight">Fra indbakke til bogført på fire trin</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl border border-line p-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">{s.n}</span>
              <p className="mt-4 font-semibold">{s.title}</p>
              <p className="mt-1 text-sm text-muted">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="funktioner" className="bg-bg py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight">Alt hvad økonomifunktionen skal bruge – og intet den ikke skal</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-line bg-surface p-6 shadow-card">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  <f.icon className="h-5 w-5" />
                </span>
                <p className="mt-4 font-semibold">{f.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="ejendomme" className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
        <div>
          <span className="text-sm font-medium text-brand">Til ejendomsadministration</span>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Hver regning på den rigtige ejendom – automatisk</h2>
          <p className="mt-4 text-ink-2">
            Fluks henter ejendomme og lejemål fra Boligflow og genkender adressen på fakturaen. Driftschefen godkender kun sine ejendomme, viceværten sender udlæg fra mobilen, og I følger budget mod forbrug pr. ejendom.
          </p>
          <ul className="mt-6 space-y-2 text-sm">
            {["Kontering pr. ejendom, lejemål og afdeling", "Godkendelsesflows pr. ejendom", "Budget vs. forbrug og udgift pr. m²", "Udgifter sendes retur til Boligflow"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-brand" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-3xl border border-line bg-bg p-5 shadow-pop">
          {[
            ["Fælledvej Gården", 0.62, "261 t. af 420 t."],
            ["Havnehuset Aarhus", 0.81, "251 t. af 310 t."],
            ["Kongensgade Erhverv", 0.44, "79 t. af 180 t."],
          ].map(([n, v, l]) => (
            <div key={n as string} className="mb-3 rounded-2xl border border-line bg-surface p-4 last:mb-0">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{n}</span>
                <span className="text-muted">{l}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-surface-2">
                <div className={`h-2 rounded-full ${Number(v) > 0.75 ? "bg-warning" : "bg-brand"}`} style={{ width: `${Number(v) * 100}%` }} />
              </div>
            </div>
          ))}
          <div className="mt-3 flex items-center gap-2 rounded-2xl border border-line bg-surface p-4 text-sm">
            <Receipt className="h-4 w-4 text-brand" /> Jonas (vicevært) indsendte et udlæg på 658,40 kr. · Fælledvej
          </div>
        </div>
      </section>

      <section id="priser" className="bg-bg py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-semibold tracking-tight">Enkle priser. Ingen gebyr pr. betaling.</h2>
          <p className="mt-2 text-center text-muted">Alle priser er ekskl. moms. Opsig når som helst.</p>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {PLANS.map((p) => (
              <div key={p.name} className={`rounded-3xl border p-7 ${p.featured ? "border-brand bg-surface shadow-pop ring-4 ring-brand/10" : "border-line bg-surface"}`}>
                <p className="flex items-center justify-between font-semibold">
                  {p.name} {p.featured ? <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] text-white">Mest valgt</span> : null}
                </p>
                <p className="mt-1 text-sm text-muted">{p.desc}</p>
                <p className="mt-5 text-4xl font-semibold tracking-tight">
                  {p.price} <span className="text-base font-normal text-muted">kr./md.</span>
                </p>
                <ul className="mt-6 space-y-2 text-sm">
                  {p.items.map((i) => (
                    <li key={i} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-brand" /> {i}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`mt-7 flex h-11 items-center justify-center rounded-xl text-sm font-semibold ${p.featured ? "bg-brand text-white hover:bg-brand-hover" : "border border-line-strong hover:bg-surface-2"}`}
                >
                  Start gratis prøveperiode
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <h2 className="text-center text-3xl font-semibold tracking-tight">Spørgsmål og svar</h2>
        <div className="mt-8 divide-y divide-line rounded-2xl border border-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
                {q} <span className="text-muted transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6">
        <div className="mx-auto max-w-6xl rounded-3xl bg-brand px-8 py-14 text-center text-white">
          <h2 className="text-3xl font-semibold tracking-tight">Klar til at slippe for manuelt fakturabøvl?</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/80">Opret en konto på to minutter – eller se demoen med en fuldt opsat ejendomsvirksomhed.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="inline-flex h-12 items-center rounded-xl bg-white px-6 font-semibold text-brand-ink">
              Opret konto
            </Link>
            <form action={demoLoginAction}>
              <input type="hidden" name="as" value="demo@fluks.dk" />
              <PendingButton pendingLabel="Åbner demoen…" className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/40 px-6 font-semibold disabled:opacity-80">
                Se demo
              </PendingButton>
            </form>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:px-6">
          <Logo />
          <p>© {new Date().getFullYear()} Fluks · Data opbevares i EU · GDPR-kompatibel</p>
        </div>
      </footer>
    </div>
  );
}
