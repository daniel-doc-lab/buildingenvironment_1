import "server-only";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import { STANDARD_ACCOUNTS, STANDARD_DEPARTMENTS, STANDARD_VAT } from "@/integrations/accounting/standard-chart";
import { SANDBOX_PROPERTIES } from "@/integrations/property/sandbox";
import { SandboxBank } from "@/integrations/bank/sandbox";
import { registerDemoCvr } from "@/integrations/cvr";
import { addDays, isoDate, todayISO } from "@/lib/utils";
import { sha256 } from "@/lib/crypto";
import { DEMO_COMPANY, DEMO_PASSWORD, DEMO_SUPPLIERS, DEMO_USERS, NEW_SUPPLIER_EXAMPLES, makeFikId, type DemoSupplier } from "./demo/catalog";
import { renderDemoInvoice, invoiceTotals, type DemoInvoiceSpec } from "./demo/invoice-pdf";
import { buildDemoUbl } from "./demo/ubl-sample";

let seeding: Promise<void> | null = null;

for (const s of [...DEMO_SUPPLIERS, ...NEW_SUPPLIER_EXAMPLES]) {
  const [street, rest] = s.address.split(", ");
  registerDemoCvr({
    cvr: s.cvr,
    name: s.name,
    address: street ?? null,
    zip: rest?.split(" ")[0] ?? null,
    city: rest?.split(" ").slice(1).join(" ") ?? null,
    phone: null,
    email: s.email,
    industry: s.industry,
    status: "Aktiv",
  });
}

export async function ensureDemoData(db: DB) {
  const existing = await db.query.companies.findFirst({ where: eq(schema.companies.isDemo, true), columns: { id: true } });
  if (existing) return;
  seeding ??= seedDemo(db).finally(() => {
    seeding = null;
  });
  await seeding;
}

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function specFor(
  s: DemoSupplier,
  opts: { invoiceNumber: string; issueDate: string; rand: () => number; property?: (typeof SANDBOX_PROPERTIES)[number] | null; fikSeed?: number },
): DemoInvoiceSpec {
  const r = opts.rand;
  const lines = s.lines.map((l) => {
    const q = l.qty[0] + Math.round(r() * (l.qty[1] - l.qty[0]));
    const p = Math.round((l.price[0] + r() * (l.price[1] - l.price[0])) * 100) / 100;
    return { description: l.description, quantity: q, unit: l.unit, unitPrice: p };
  });
  const payment: DemoInvoiceSpec["payment"] =
    s.payment.kind === "fik"
      ? { kind: "fik", type: s.payment.type, creditor: s.payment.creditor, paymentId: s.payment.type === "73" ? undefined : makeFikId(opts.fikSeed ?? Math.floor(r() * 1e9)) }
      : s.payment;
  return {
    supplier: { name: s.name, cvr: s.cvr, address: s.address, email: s.email, color: s.color },
    customer: { name: DEMO_COMPANY.name, address: DEMO_COMPANY.address, cvr: DEMO_COMPANY.cvr },
    invoiceNumber: opts.invoiceNumber,
    issueDate: opts.issueDate,
    dueDate: addDays(opts.issueDate, s.termsDays),
    lines,
    payment,
    deliveryAddress: opts.property?.address ?? null,
  };
}

async function seedDemo(db: DB) {
  const prevAi = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = "demo"; // demo-data skal være deterministisk og hurtig
  try {
    await seedDemoInner(db);
  } finally {
    if (prevAi === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = prevAi;
  }
}

async function seedDemoInner(db: DB) {
  const rand = rng(42);
  const today = todayISO();
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // Brugere
  const userIds: Record<string, string> = {};
  for (const u of DEMO_USERS) {
    const found = await db.query.users.findFirst({ where: eq(schema.users.email, u.email) });
    if (found) {
      userIds[u.key] = found.id;
      continue;
    }
    const [row] = await db
      .insert(schema.users)
      .values({ email: u.email, name: u.name, passwordHash: hash, bankReg: u.bankReg, bankAccount: u.bankAccount })
      .returning({ id: schema.users.id });
    userIds[u.key] = row!.id;
  }

  // Virksomhed
  const [company] = await db
    .insert(schema.companies)
    .values({
      name: DEMO_COMPANY.name,
      cvr: DEMO_COMPANY.cvr,
      address: DEMO_COMPANY.address,
      slug: `nordlys-${Math.floor(rand() * 9000 + 1000)}`,
      isDemo: true,
      settings: {
        paymentLeadDays: 1,
        fourEyesThreshold: 5_000_000,
        autoApproveBelow: 200_000,
        reminderHours: 24,
        propertyModule: true,
        onboardingDone: true,
      },
    })
    .returning();
  const companyId = company!.id;
  for (const u of DEMO_USERS) {
    await db.insert(schema.memberships).values({ userId: userIds[u.key]!, companyId, role: u.role, title: u.title }).onConflictDoNothing();
  }

  // Stamdata (som synkroniseret fra e-conomic)
  await db.insert(schema.accounts).values(STANDARD_ACCOUNTS.map((a) => ({ companyId, ...a })));
  await db.insert(schema.vatCodes).values(STANDARD_VAT.map((v) => ({ companyId, ...v })));
  await db.insert(schema.departments).values(STANDARD_DEPARTMENTS.map((d) => ({ companyId, ...d })));
  await db.insert(schema.integrations).values([
    { companyId, provider: "economic", mode: "sandbox", status: "connected", lastSyncAt: new Date() },
    { companyId, provider: "boligflow", mode: "sandbox", status: "connected", lastSyncAt: new Date() },
    { companyId, provider: "nemhandel", mode: "sandbox", status: "connected", config: { endpoint: DEMO_COMPANY.cvr } },
  ]);

  // Ejendomme (som synkroniseret fra Boligflow)
  const propIds: Record<string, string> = {};
  const budgets = [42_000_000, 31_000_000, 18_000_000];
  for (const [i, p] of SANDBOX_PROPERTIES.entries()) {
    const [row] = await db
      .insert(schema.properties)
      .values({
        companyId,
        externalId: p.externalId,
        name: p.name,
        address: p.address,
        zip: p.zip,
        city: p.city,
        annualBudget: budgets[i] ?? null,
        departmentCode: null,
      })
      .returning({ id: schema.properties.id });
    propIds[p.externalId] = row!.id;
    await db.insert(schema.units).values(p.units.map((u) => ({ propertyId: row!.id, ...u })));
  }

  // Bank (sandbox – Danske Bank)
  const conn = await new SandboxBank().completeConnection({ code: "demo", bankId: "danske" });
  const [bc] = await db
    .insert(schema.bankConnections)
    .values({
      companyId,
      provider: "sandbox",
      bankId: "danske",
      bankName: "Danske Bank",
      status: "active",
      externalId: conn.externalId,
      consentExpiresAt: conn.expiresAt,
      lastSyncAt: new Date(),
    })
    .returning();
  const bankAccountIds: string[] = [];
  for (const [i, a] of conn.accounts.entries()) {
    const [row] = await db
      .insert(schema.bankAccounts)
      .values({
        companyId,
        connectionId: bc!.id,
        externalId: a.externalId,
        name: a.name,
        bankName: "Danske Bank",
        reg: a.reg,
        account: a.account,
        iban: a.iban,
        bic: a.bic,
        currency: "DKK",
        balance: a.balance,
        balanceAt: new Date(),
        ledgerAccount: i === 0 ? "5810" : "5820",
      })
      .returning({ id: schema.bankAccounts.id });
    bankAccountIds.push(row!.id);
  }
  const mainAccount = bankAccountIds[0]!;
  await db
    .update(schema.companies)
    .set({ settings: { ...company!.settings, defaultPaymentAccountId: mainAccount } })
    .where(eq(schema.companies.id, companyId));

  // Leverandører
  const supplierIds: Record<string, string> = {};
  for (const s of DEMO_SUPPLIERS) {
    const [row] = await db
      .insert(schema.suppliers)
      .values({
        companyId,
        name: s.name,
        cvr: s.cvr,
        address: s.address,
        email: s.email,
        industry: s.industry,
        bankReg: s.payment.kind === "bank" ? s.payment.reg : null,
        bankAccount: s.payment.kind === "bank" ? s.payment.account : null,
        fiCreditor: s.payment.kind === "fik" ? s.payment.creditor : null,
        paymentTermsDays: s.termsDays,
        trusted: !!s.trusted,
        bankVerifiedAt: new Date(Date.now() - 200 * 86_400_000),
        externalId: String(100 + Object.keys(supplierIds).length),
      })
      .returning({ id: schema.suppliers.id });
    supplierIds[s.key] = row!.id;
  }

  // Godkendelsesflows
  await db.insert(schema.approvalWorkflows).values([
    {
      companyId,
      name: "Udlæg fra medarbejdere",
      priority: 5,
      conditions: { kinds: ["expense"] },
      steps: [{ name: "Bogholder", approverIds: [], role: "accountant", mode: "any" }],
    },
    {
      companyId,
      name: "Store beløb over 25.000 kr.",
      priority: 10,
      conditions: { minAmount: 2_500_000 },
      steps: [
        { name: "Driftschef", approverIds: [userIds.approver!], role: null, mode: "any" },
        { name: "Direktør", approverIds: [userIds.owner!], role: null, mode: "any" },
      ],
    },
    {
      companyId,
      name: "Ejendomsdrift",
      priority: 20,
      conditions: { propertyIds: Object.values(propIds) },
      steps: [{ name: "Driftschef", approverIds: [userIds.approver!], role: null, mode: "any" }],
    },
    {
      companyId,
      name: "Øvrige fakturaer",
      priority: 100,
      conditions: {},
      steps: [{ name: "Direktør", approverIds: [userIds.owner!], role: null, mode: "any" }],
    },
  ]);
  await db.insert(schema.codingRules).values({
    companyId,
    name: "Vinduespudsning → Rengøring",
    matchText: "vinduespudsning",
    accountNumber: "3150",
    vatCode: "I25",
    source: "manual",
    hits: 7,
  });

  // Historik: 6 måneders betalte fakturaer
  let invSeq = 1;
  const props = SANDBOX_PROPERTIES;
  for (let m = 6; m >= 1; m--) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setMonth(monthStart.getMonth() - m);
    for (const s of DEMO_SUPPLIERS) {
      const occurs = s.monthly || rand() < 0.35 || (s.key === "forsikring" && m % 3 === 0);
      if (!occurs || (s.key === "forsikring" && m % 3 !== 0)) continue;
      const targets = s.property ? (s.monthly ? props.slice(0, s.key === "energi" || s.key === "rengoring" ? 3 : 2) : [props[Math.floor(rand() * props.length)]!]) : [null];
      for (const p of targets) {
        const issue = new Date(monthStart);
        issue.setDate(2 + Math.floor(rand() * 20));
        const issueDate = isoDate(issue);
        const spec = specFor(s, { invoiceNumber: `${s.key.slice(0, 2).toUpperCase()}-${2025000 + invSeq++}`, issueDate, rand, property: p });
        await insertHistoricInvoice(db, {
          companyId,
          supplier: s,
          supplierId: supplierIds[s.key]!,
          spec,
          propertyId: p ? propIds[p.externalId]! : null,
          bankAccountId: mainAccount,
          submittedBy: userIds.accountant!,
          approverId: s.property ? userIds.approver! : userIds.owner!,
        });
      }
    }
  }

  // Indgående husleje på bankkontoen (for et realistisk billede)
  for (let m = 6; m >= 0; m--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - m);
    if (isoDate(d) > today) continue;
    await db.insert(schema.bankTransactions).values({
      companyId,
      bankAccountId: mainAccount,
      externalId: `rent-${m}`,
      bookingDate: isoDate(d),
      amount: 18_650_000,
      text: "Huslejeindbetalinger via Boligflow",
      counterparty: "Boligflow Opkrævning",
      status: "ignored",
    });
  }

  // Aktuelle dokumenter – kører gennem den rigtige pipeline (AI-aflæsning, kontering, kontrol, routing)
  const { ingestDocument } = await import("./services/ingest");
  const ingest = async (spec: DemoInvoiceSpec, opts?: { source?: "upload" | "email" | "mobile"; kind?: "invoice" | "expense"; userId?: string }) => {
    const pdf = await renderDemoInvoice(spec);
    return ingestDocument(db, {
      companyId,
      userId: opts?.userId ?? userIds.accountant!,
      file: { name: `${spec.supplier.name.split(" ")[0]}-${spec.invoiceNumber}.pdf`, mime: "application/pdf", data: pdf },
      source: opts?.source ?? "email",
      kind: opts?.kind,
    });
  };
  const sup = (k: string) => DEMO_SUPPLIERS.find((s) => s.key === k)!;
  const recent = (daysAgo: number) => addDays(today, -daysAgo);

  // 1-3: Kendte leverandører → typisk direkte til godkendelse
  await ingest(specFor(sup("energi"), { invoiceNumber: "EN-2026311", issueDate: recent(4), rand, property: props[0] }));
  await ingest(specFor(sup("vand"), { invoiceNumber: "VA-2026312", issueDate: recent(6), rand, property: props[1] }));
  await ingest(specFor(sup("revisor"), { invoiceNumber: "RE-2026313", issueDate: recent(3), rand }));
  const cleaningId = await ingest(specFor(sup("rengoring"), { invoiceNumber: "RE-2026314", issueDate: recent(9), rand, property: props[0] }));
  const heatId = await ingest(specFor(sup("varme"), { invoiceNumber: "FJ-2026315", issueDate: recent(11), rand, property: props[0] }));
  await ingest(specFor(sup("software"), { invoiceNumber: "CV-2026316", issueDate: recent(2), rand }));

  // 4: Svindelforsøg – VVS-firmaet har "skiftet konto"
  const fraud = specFor(sup("vvs"), { invoiceNumber: "HS-2026317", issueDate: recent(1), rand, property: props[1] });
  fraud.payment = { kind: "bank", reg: "9570", account: "0098765432" };
  fraud.note = "OBS: Vi har skiftet bank. Benyt venligst det nye kontonummer ovenfor.";
  await ingest(fraud);

  // 5: Dublet – samme Cloudværk-faktura sendt to gange
  await ingest(specFor(sup("software"), { invoiceNumber: "CV-2026316", issueDate: recent(2), rand }), { source: "upload" });

  // 6: Ny leverandør med stort beløb
  await ingest(specFor(NEW_SUPPLIER_EXAMPLES[0]!, { invoiceNumber: "2026-0418", issueDate: recent(2), rand, property: props[0] }), { source: "upload" });

  // 7: E-faktura via NemHandel (OIOUBL)
  const aff = sup("affald");
  const ublSpec = specFor(aff, { invoiceNumber: "AF-2026320", issueDate: recent(5), rand, property: props[2] });
  const xml = buildDemoUbl(ublSpec);
  await ingestDocument(db, {
    companyId,
    userId: null,
    file: { name: `NemHandel-${ublSpec.invoiceNumber}.xml`, mime: "application/xml", data: Buffer.from(xml) },
    source: "nemhandel",
  });

  // 8: Udlæg fra viceværten
  const receipt: DemoInvoiceSpec = {
    supplier: { name: "Byggemarked Nord A/S", cvr: "31245678", address: "Lagervej 2, 2400 København NV", email: "kvittering@byggemarkednord.dk", color: [0.9, 0.5, 0.1] },
    customer: { name: "Jonas Nielsen (Nordlys Ejendomme)", address: DEMO_COMPANY.address },
    invoiceNumber: "K-88213",
    issueDate: recent(1),
    dueDate: recent(1),
    lines: [
      { description: "Pærer LED E27 fællesarealer", quantity: 12, unit: "stk", unitPrice: 31.96 },
      { description: "Silikone og fugepistol", quantity: 1, unitPrice: 143.2 },
    ],
    payment: { kind: "card", last4: "4821" },
    deliveryAddress: "Fælledvej 18, 2200 København N",
    title: "KVITTERING",
  };
  await ingest(receipt, { source: "mobile", kind: "expense", userId: userIds.member! });

  // Godkend et par fakturaer, så der er planlagte betalinger
  const { decide, submitForApproval } = await import("./services/approvals");
  for (const id of [cleaningId, heatId]) {
    const inv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, id) });
    if (inv?.status === "review") await submitForApproval(db, id, userIds.accountant!).catch(() => undefined);
    const pending = await db
      .select()
      .from(schema.approvals)
      .where(and(eq(schema.approvals.invoiceId, id), eq(schema.approvals.status, "pending")));
    for (const a of pending) await decide(db, id, a.userId, "approve").catch(() => undefined);
  }

  // En postering der ikke er afstemt endnu (kortkøb)
  await db.insert(schema.bankTransactions).values({
    companyId,
    bankAccountId: mainAccount,
    externalId: "card-1",
    bookingDate: recent(2),
    amount: -48_900,
    text: "Dankort Byggemarked Nord",
    counterparty: "Byggemarked Nord",
    status: "unmatched",
  });

  await db.insert(schema.notifications).values({
    companyId,
    userId: userIds.owner!,
    type: "welcome",
    title: "Velkommen til Fluks 👋",
    body: "Demovirksomheden er klar med fakturaer, godkendelser, bank og ejendomme. Prøv at uploade en faktura eller tryk ⌘K.",
    link: "/app",
  });
}

async function insertHistoricInvoice(
  db: DB,
  o: {
    companyId: string;
    supplier: DemoSupplier;
    supplierId: string;
    spec: DemoInvoiceSpec;
    propertyId: string | null;
    bankAccountId: string;
    submittedBy: string;
    approverId: string;
  },
) {
  const { spec, supplier: s } = o;
  const totals = invoiceTotals(spec);
  const pdf = await renderDemoInvoice(spec);
  const [file] = await db
    .insert(schema.files)
    .values({ companyId: o.companyId, name: `${s.name.split(" ")[0]}-${spec.invoiceNumber}.pdf`, mime: "application/pdf", size: pdf.length, sha256: sha256(pdf), data: pdf })
    .returning({ id: schema.files.id });
  const fik = spec.payment.kind === "fik" ? spec.payment : null;
  const bank = spec.payment.kind === "bank" ? spec.payment : null;
  const method = spec.payment.kind === "betalingsservice" ? "betalingsservice" : fik ? "fik" : "domestic";
  const paidDate = spec.dueDate > todayISO() ? todayISO() : spec.dueDate;
  const [inv] = await db
    .insert(schema.invoices)
    .values({
      companyId: o.companyId,
      supplierId: o.supplierId,
      fileId: file!.id,
      source: "email",
      kind: "invoice",
      status: method === "betalingsservice" ? "archived" : "paid",
      supplierName: s.name,
      supplierCvr: s.cvr,
      invoiceNumber: spec.invoiceNumber,
      issueDate: spec.issueDate,
      dueDate: spec.dueDate,
      amountExVat: totals.net,
      vatAmount: totals.vat,
      totalAmount: totals.total,
      paymentMethod: method,
      fikType: fik?.type ?? null,
      fikCreditor: fik?.creditor ?? null,
      fikPaymentId: fik?.paymentId ?? null,
      bankReg: bank?.reg ?? null,
      bankAccount: bank?.account ?? null,
      paymentMessage: `Faktura ${spec.invoiceNumber}`,
      description: `Faktura fra ${s.name} vedr. ${spec.lines[0]!.description.toLowerCase()}`,
      propertyId: o.propertyId,
      extraction: { provider: "demo", confidence: { supplier: 0.95, invoiceNumber: 0.9, dates: 0.92, amounts: 0.95, payment: 0.93 } },
      flags: [],
      bookedAt: new Date(spec.issueDate + "T15:00:00"),
      externalVoucher: String(800 + Math.floor(Math.random() * 900)),
      paidAt: method === "betalingsservice" ? null : new Date(paidDate + "T09:00:00"),
      submittedBy: o.submittedBy,
      createdAt: new Date(spec.issueDate + "T08:30:00"),
    })
    .returning({ id: schema.invoices.id });
  await db.insert(schema.invoiceLines).values(
    spec.lines.map((l, i) => ({
      invoiceId: inv!.id,
      position: i,
      description: l.description,
      quantity: l.quantity,
      unitPrice: Math.round(l.unitPrice * 100),
      amount: Math.round(l.quantity * l.unitPrice * 100),
      vatCode: s.account === "3180" ? "U0" : "I25",
      accountNumber: s.account,
      propertyId: o.propertyId,
    })),
  );
  await db.insert(schema.approvals).values({
    invoiceId: inv!.id,
    stepIndex: 0,
    stepName: s.property ? "Driftschef" : "Direktør",
    userId: o.approverId,
    status: "approved",
    decidedAt: new Date(spec.issueDate + "T13:00:00"),
  });
  if (method === "betalingsservice") return;
  const [pay] = await db
    .insert(schema.payments)
    .values({
      companyId: o.companyId,
      invoiceId: inv!.id,
      amount: totals.total,
      executionDate: paidDate,
      status: "executed",
      creditorName: s.name,
      method,
      fikType: fik?.type ?? null,
      fikCreditor: fik?.creditor ?? null,
      fikPaymentId: fik?.paymentId ?? null,
      bankReg: bank?.reg ?? null,
      bankAccount: bank?.account ?? null,
      message: `Faktura ${spec.invoiceNumber}`,
      ownReference: `FLK-${spec.invoiceNumber}`,
      executedAt: new Date(paidDate + "T09:00:00"),
    })
    .returning({ id: schema.payments.id });
  await db.insert(schema.bankTransactions).values({
    companyId: o.companyId,
    bankAccountId: o.bankAccountId,
    externalId: `hist-${pay!.id}`,
    bookingDate: paidDate,
    amount: -totals.total,
    text: fik ? `FI-kort +${fik.type} ${s.name}`.slice(0, 80) : `Overf. ${s.name}`.slice(0, 80),
    counterparty: s.name,
    reference: `FLK-${spec.invoiceNumber}`,
    status: "matched",
    matchedInvoiceId: inv!.id,
    matchedPaymentId: pay!.id,
    matchConfidence: 1,
  });
}
