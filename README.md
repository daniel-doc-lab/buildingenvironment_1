# Fluks – fakturaer betalt. Fluks.

Fluks er en AI-drevet platform til fakturahåndtering og betaling for danske virksomheder, med et ejendomsmodul til ejendomsadministratorer. Den dækker hele forløbet: fakturaen modtages, AI aflæser og konterer den, systemet kontrollerer for fejl og svindel, de rette personer godkender, og fakturaen betales via banken, afstemmes og bogføres i e-conomic.

## Kom i gang

```bash
npm install
npm run dev          # http://localhost:3000
```

Du behøver ingen opsætning. Uden miljøvariabler kører Fluks med:

- en indlejret Postgres-database (PGlite) i `./.data`
- demovirksomheden **Nordlys Ejendomme ApS** med 6 måneders historik, ejendomme, bank og igangværende fakturaer
- sandbox-bank med simuleret MitID, sandbox-e-conomic og sandbox-Boligflow
- **Demo-AI**, som er en regelbaseret aflæsning af danske fakturaer og kontering ud fra historik

På `/login` kan du logge ind med ét klik som ejer, bogholder, driftschef eller vicevært. Adgangskoden er `demo1234` for alle demobrugere.

## Funktioner

| Område | Hvad Fluks gør |
|---|---|
| **Indbakke** | Upload (træk og slip eller mobilkamera), unik e-mailadresse pr. virksomhed og NemHandel/Peppol (OIOUBL og Peppol BIS). Masse-handlinger og søgning. |
| **AI-aflæsning** | Claude (vision/PDF) eller demo-AI udtrækker leverandør, CVR, datoer, beløb, moms, linjer, FI-kort (+71/+73/+75), reg./konto, IBAN og kontantrabat. Hvert felt får en sikkerhedsscore. E-fakturaer parses 100 % præcist. |
| **Leverandører** | Oprettes automatisk og beriges fra CVR-registret. Betroede leverandører, standardkontering og historik. |
| **AI-kontering** | Rækkefølgen er: regler, så leverandørens standard, så historik, så AI. Forslag til konto, momskode, ejendom og lejemål med begrundelse. Fluks lærer selv nye regler af godkendte fakturaer. |
| **Svindel- og fejlkontrol** | Fanger ændrede kontonumre (blokerer betalingen, indtil nummeret er bekræftet), dubletter (samme nr., fil eller beløb og dato), prisudsving, nye leverandører med store beløb, moms- og sumfejl, manglende betalingsinfo, overskredne forfald og kontantrabat. |
| **Godkendelse** | Visuel flow-editor med betingelser (beløb, ejendom, leverandør, type, ny leverandør), flere trin, "én af" eller "alle", roller, stedfortrædere og påmindelser. Man kan ikke godkende sit eget udlæg. Godkendelse med ét klik og masse-godkendelse, også på mobil. |
| **Betalinger** | Betalingsdatoen beregnes automatisk ud fra forfald minus buffer, eller før kontantrabatten udløber, og weekender springes over. Betalingerne samles i batches med 4-øjne-princip over en beløbsgrænse. Underskrift sker med MitID via PSD2, eller man henter en **pain.001-fil** til netbanken. |
| **Bank og afstemning** | Bank connect til danske banker, saldi og posteringer. Automatisk matching på beløb, reference, FI-id, modtager og dato. Manuel matching med forslag. |
| **e-conomic** | Kontoplan, momskoder, afdelinger og leverandører synkroniseres. Godkendte fakturaer bogføres i kassekladden med bilag, og betalinger registreres. |
| **Boligflow og ejendomme** | Ejendomme og lejemål synkroniseres (eller importeres fra CSV). Kontering pr. ejendom og lejemål, budget mod forbrug, pris pr. m², og udgifter sendes tilbage til Boligflow. |
| **Udlæg** | Medarbejderen tager et billede af kvitteringen, AI udfylder resten, udlægget godkendes og refunderes til medarbejderens konto. |
| **AI-assistent (⌘K)** | Spørgsmål på dansk, fx "Hvad forfalder i denne uge?", "Godkend alle fra Lysgaard under 5.000" eller "Hvor meget har vi brugt på Fælledvej i år?". Handlinger skal altid bekræftes af brugeren. |
| **Likviditet** | 30/60/90-dages prognose ud fra planlagte betalinger, fakturaer under godkendelse, tilbagevendende regninger og indbetalinger. |
| **Rapporter** | Forbrug pr. måned, leverandør, konto og ejendom, tid til godkendelse, andel betalt til tiden og AI-træfsikkerhed. CSV-eksport til Excel. |
| **Sikkerhed og compliance** | Roller (ejer, admin, bogholder, godkender, medarbejder, revisor), et uforanderligt revisionsspor og krypterede API-nøgler (AES-256-GCM). Flere virksomheder pr. bruger. |
| **Mobil (PWA)** | Kan installeres som app, har bundnavigation og kamera-upload. |

## Tilslut rigtige systemer

Alle integrationer er bygget som adaptere med en sandbox-tilstand. En integration går live, når der indsættes nøgler (se `.env.example`):

| Integration | Sådan går den live |
|---|---|
| **Claude AI** | `ANTHROPIC_API_KEY` eller en nøgle pr. virksomhed under *Indstillinger → Integrationer*. Standardmodel: `claude-opus-5-5`. |
| **Bank (PSD2)** | Opret en applikation hos [Enable Banking](https://enablebanking.com) og sæt `ENABLEBANKING_APP_ID` + `ENABLEBANKING_PRIVATE_KEY`. Uden PSD2-aftale kan man altid bruge pain.001-filer. |
| **e-conomic** | Registrér en app hos e-conomic (`ECONOMIC_APP_SECRET_TOKEN`, `ECONOMIC_APP_PUBLIC_TOKEN`). Kunden forbinder via login-knappen eller ved at indsætte et Agreement Grant Token. |
| **Boligflow** | API-adgang købes hos Boligflow. Nøglen indsættes pr. virksomhed. Feltmapningen i `src/integrations/property/boligflow.ts` tilpasses, når Boligflows API-dokumentation foreligger. |
| **NemHandel/Peppol** | Aftal med en access point-udbyder, at indgående dokumenter POST'es til `/api/inbound/nemhandel?company=<slug>` med headeren `X-Fluks-Secret`. |
| **E-mail-indbakke** | Peg MX for `indbakke.<domæne>` på Postmark Inbound og sæt webhooken til `/api/inbound/email`. |
| **Udgående mail** | `RESEND_API_KEY`. |

> **Bemærk:** FI-kort-mapningen i pain.001 følger den gængse danske ISO 20022-praksis. Validér mod jeres banks Message Implementation Guide, før I går i produktion.

## Arkitektur

- **Next.js 16** (App Router, Server Actions, Turbopack), **React 19**, **Tailwind CSS 4**
- **Drizzle ORM** på Postgres (`DATABASE_URL`) eller indlejret **PGlite**. Migreringer ligger i `drizzle/` og køres automatisk ved opstart.
- `src/server/services/` indeholder forretningslogikken (indlæsning, kontering, kontrol, godkendelse, betaling, bank, bogføring, likviditet, assistent)
- `src/integrations/` indeholder adapterne (AI, bank, regnskab, ejendom, e-faktura, CVR, e-mail)
- `/api/cron` gennemfører betalinger, synkroniserer banker og sender påmindelser. Kør den fx hvert 15. minut. `vercel.json` kører den dagligt, fordi Vercel Hobby kun tillader daglige cron-jobs.

## Kommandoer

```bash
npm run dev          # udvikling
npm run build        # produktionsbuild
npm run lint         # ESLint
npm run typecheck    # TypeScript
npm test             # unit-tests (Vitest)
npm run test:e2e     # end-to-end (Playwright) mod produktionsbuild
npm run db:generate  # ny migrering efter ændring i src/db/schema.ts
npm run db:migrate   # kør migreringer mod DATABASE_URL
```

## Deploy (Vercel + Supabase/Neon)

1. Opret en Postgres-database og sæt `DATABASE_URL`.
2. Sæt `AUTH_SECRET` (mindst 32 tilfældige tegn) og `APP_URL`.
3. Deploy. Migreringer køres ved første request. Sæt `SEED_DEMO=false` i produktion, hvis I ikke vil have demovirksomheden med.
