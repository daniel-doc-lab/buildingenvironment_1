import "server-only";
import { and, eq, inArray, lte, desc } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import { addDays, todayISO, formatMoney } from "@/lib/utils";
import { getBankProvider, type PaymentInstruction, type DebtorAccount } from "@/integrations/bank";
import { buildPain001 } from "@/integrations/bank/pain001";
import { randomToken } from "@/lib/crypto";
import { audit } from "../audit";
import { notify, companyUsersWithRoles } from "./notifications";

type Payment = typeof schema.payments.$inferSelect;

/** Planlægger betaling af godkendt faktura: på forfaldsdato (minus bufferdage) eller før kontantrabat udløber. */
export async function createPaymentForInvoice(db: DB, invoiceId: string) {
  const inv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, invoiceId) });
  if (!inv || !inv.totalAmount) return null;
  const existing = await db.query.payments.findFirst({
    where: and(eq(schema.payments.invoiceId, invoiceId), inArray(schema.payments.status, ["planned", "in_batch", "submitted", "executed"])),
  });
  if (existing) return existing;
  const company = (await db.query.companies.findFirst({ where: eq(schema.companies.id, inv.companyId) }))!;
  const lead = company.settings.paymentLeadDays ?? 1;
  const today = todayISO();

  let amount = inv.totalAmount;
  let target = inv.dueDate ?? addDays(today, 3);
  if (inv.discountDate && inv.discountAmount && inv.discountDate >= today) {
    amount = inv.discountAmount;
    target = inv.discountDate;
  }
  let executionDate = addDays(target, -lead);
  if (executionDate < today) executionDate = today;
  executionDate = nextBankDay(executionDate);

  let method: "fik" | "domestic" | "iban" = "domestic";
  let creditor = {
    creditorName: inv.supplierName ?? "Ukendt",
    fikType: inv.fikType,
    fikCreditor: inv.fikCreditor,
    fikPaymentId: inv.fikPaymentId,
    bankReg: inv.bankReg,
    bankAccount: inv.bankAccount,
    iban: inv.iban,
    bic: inv.bic,
  };
  if (inv.kind === "expense") {
    const user = inv.expenseUserId ? await db.query.users.findFirst({ where: eq(schema.users.id, inv.expenseUserId) }) : null;
    creditor = { ...creditor, creditorName: user?.name ?? "Medarbejder", bankReg: user?.bankReg ?? null, bankAccount: user?.bankAccount ?? null, iban: null, fikCreditor: null };
    method = "domestic";
  } else if (inv.paymentMethod === "fik") method = "fik";
  else if (inv.paymentMethod === "iban") method = "iban";

  const [p] = await db
    .insert(schema.payments)
    .values({
      companyId: inv.companyId,
      invoiceId,
      amount,
      currency: inv.currency,
      executionDate,
      status: "planned",
      method,
      ...creditor,
      message: inv.kind === "expense" ? `Refusion udlæg ${inv.invoiceNumber ?? ""}`.trim() : inv.paymentMessage ?? `Faktura ${inv.invoiceNumber ?? ""}`.trim(),
      ownReference: `FLK-${(inv.invoiceNumber ?? inv.id.slice(0, 8)).replace(/\s/g, "")}`.slice(0, 35),
    })
    .returning();
  return p!;
}

/** Weekend → mandag. (Helligdage håndteres af banken.) */
export function nextBankDay(iso: string) {
  const d = new Date(iso + "T12:00:00");
  const dow = d.getDay();
  if (dow === 6) return addDays(iso, 2);
  if (dow === 0) return addDays(iso, 1);
  return iso;
}

export function paymentProblems(p: Pick<Payment, "method" | "fikCreditor" | "fikType" | "bankReg" | "bankAccount" | "iban" | "amount">) {
  const errs: string[] = [];
  if (p.amount <= 0) errs.push("Beløb skal være positivt");
  if (p.method === "fik" && (!p.fikCreditor || !p.fikType)) errs.push("FI-kreditornummer mangler");
  if (p.method === "domestic" && (!p.bankReg || !p.bankAccount)) errs.push("Reg.- og kontonummer mangler");
  if (p.method === "iban" && !p.iban) errs.push("IBAN mangler");
  return errs;
}

function toInstruction(p: Payment): PaymentInstruction {
  return {
    id: p.id,
    amount: p.amount,
    currency: p.currency,
    executionDate: p.executionDate,
    creditorName: p.creditorName,
    method: p.method as PaymentInstruction["method"],
    fikType: p.fikType,
    fikCreditor: p.fikCreditor,
    fikPaymentId: p.fikPaymentId,
    bankReg: p.bankReg,
    bankAccount: p.bankAccount,
    iban: p.iban,
    bic: p.bic,
    message: p.message,
    ownReference: p.ownReference,
  };
}

/** Samler planlagte betalinger i en batch. Over 4-øjne-grænsen kræves en anden godkender før underskrift. */
export async function createBatch(
  db: DB,
  ctx: { companyId: string; userId: string },
  opts: { paymentIds: string[]; bankAccountId: string; method: "api" | "file" },
) {
  const list = await db
    .select()
    .from(schema.payments)
    .where(and(eq(schema.payments.companyId, ctx.companyId), inArray(schema.payments.id, opts.paymentIds), eq(schema.payments.status, "planned")));
  if (!list.length) throw new Error("Vælg mindst én planlagt betaling");
  const problems = list.flatMap((p) => paymentProblems(p).map((e) => `${p.creditorName}: ${e}`));
  if (problems.length) throw new Error(problems.join(". "));
  const account = await db.query.bankAccounts.findFirst({
    where: and(eq(schema.bankAccounts.id, opts.bankAccountId), eq(schema.bankAccounts.companyId, ctx.companyId)),
  });
  if (!account) throw new Error("Vælg en bankkonto");
  const company = (await db.query.companies.findFirst({ where: eq(schema.companies.id, ctx.companyId) }))!;
  const total = list.reduce((s, p) => s + p.amount, 0);
  const fourEyes = company.settings.fourEyesThreshold ?? 5_000_000;
  const needsSecond = total >= fourEyes;

  const [batch] = await db
    .insert(schema.paymentBatches)
    .values({
      companyId: ctx.companyId,
      bankAccountId: account.id,
      method: opts.method,
      totalAmount: total,
      count: list.length,
      createdBy: ctx.userId,
      status: needsSecond ? "awaiting_second_approval" : opts.method === "file" ? "draft" : "awaiting_signature",
    })
    .returning();
  await db
    .update(schema.payments)
    .set({ batchId: batch!.id, status: "in_batch" })
    .where(inArray(schema.payments.id, list.map((p) => p.id)));
  const invoiceIds = list.map((p) => p.invoiceId).filter((x): x is string => !!x);
  if (invoiceIds.length) await db.update(schema.invoices).set({ status: "scheduled" }).where(inArray(schema.invoices.id, invoiceIds));
  await audit(db, ctx.companyId, ctx.userId, "payment_batch", batch!.id, "created", { total, count: list.length, method: opts.method });

  if (needsSecond) {
    const signers = (await companyUsersWithRoles(db, ctx.companyId, ["owner", "admin", "accountant"])).filter((u) => u !== ctx.userId);
    await notify(db, {
      companyId: ctx.companyId,
      userIds: signers,
      type: "batch_second_approval",
      title: `Betalingsbatch på ${formatMoney(total)} kræver din godkendelse`,
      body: `${list.length} betalinger. 4-øjne-princippet kræver en anden person.`,
      link: `/app/payments/batches/${batch!.id}`,
      email: true,
    });
  } else if (opts.method === "file") {
    await exportBatchFile(db, ctx, batch!.id);
  }
  return batch!;
}

export async function approveBatchSecond(db: DB, ctx: { companyId: string; userId: string }, batchId: string) {
  const batch = await getBatch(db, ctx.companyId, batchId);
  if (batch.status !== "awaiting_second_approval") throw new Error("Batchen afventer ikke 2. godkendelse");
  if (batch.createdBy === ctx.userId) throw new Error("4-øjne-princip: en anden person end opretteren skal godkende");
  await db
    .update(schema.paymentBatches)
    .set({ secondApproverId: ctx.userId, status: batch.method === "file" ? "draft" : "awaiting_signature" })
    .where(eq(schema.paymentBatches.id, batchId));
  await audit(db, ctx.companyId, ctx.userId, "payment_batch", batchId, "second_approved");
  if (batch.method === "file") await exportBatchFile(db, ctx, batchId);
}

async function getBatch(db: DB, companyId: string, batchId: string) {
  const b = await db.query.paymentBatches.findFirst({
    where: and(eq(schema.paymentBatches.id, batchId), eq(schema.paymentBatches.companyId, companyId)),
  });
  if (!b) throw new Error("Batch findes ikke");
  return b;
}

async function debtorFor(db: DB, bankAccountId: string | null): Promise<{ debtor: DebtorAccount; connection: typeof schema.bankConnections.$inferSelect | null; bankName: string }> {
  const acc = bankAccountId ? await db.query.bankAccounts.findFirst({ where: eq(schema.bankAccounts.id, bankAccountId) }) : null;
  if (!acc) throw new Error("Bankkonto mangler");
  const connection = acc.connectionId ? (await db.query.bankConnections.findFirst({ where: eq(schema.bankConnections.id, acc.connectionId) })) ?? null : null;
  const company = await db.query.companies.findFirst({ where: eq(schema.companies.id, acc.companyId) });
  return {
    debtor: { externalId: acc.externalId, iban: acc.iban, reg: acc.reg, account: acc.account, bic: acc.bic, name: company?.name ?? acc.name },
    connection,
    bankName: connection?.bankId ?? acc.bankName ?? "",
  };
}

/** Starter underskrift af batchen i banken (PSD2 PIS + MitID). Returnerer URL til SCA. */
export async function signBatch(db: DB, ctx: { companyId: string; userId: string }, batchId: string, appUrl: string) {
  const batch = await getBatch(db, ctx.companyId, batchId);
  if (batch.status !== "awaiting_signature") throw new Error("Batchen er ikke klar til underskrift");
  const { debtor, connection, bankName } = await debtorFor(db, batch.bankAccountId);
  const provider = getBankProvider(connection?.provider ?? "sandbox");
  const list = await db.select().from(schema.payments).where(eq(schema.payments.batchId, batchId));
  const state = `batch:${batchId}:${randomToken(8)}`;
  const { externalId, scaUrl } = await provider.initiatePayments({
    debtor,
    bankName,
    payments: list.map(toInstruction),
    state,
    redirectUrl: `${appUrl}/api/bank/callback`,
  });
  await db.update(schema.paymentBatches).set({ externalId, scaUrl, signedBy: ctx.userId }).where(eq(schema.paymentBatches.id, batchId));
  await audit(db, ctx.companyId, ctx.userId, "payment_batch", batchId, "sign_started", { provider: provider.id });
  return scaUrl;
}

/** Kaldes når brugeren kommer tilbage fra bankens SCA. */
export async function completeBatchSignature(db: DB, batchId: string, ok: boolean) {
  const batch = await db.query.paymentBatches.findFirst({ where: eq(schema.paymentBatches.id, batchId) });
  if (!batch) throw new Error("Batch findes ikke");
  if (!ok) {
    await db.update(schema.paymentBatches).set({ status: "awaiting_signature" }).where(eq(schema.paymentBatches.id, batchId));
    await audit(db, batch.companyId, batch.signedBy, "payment_batch", batchId, "sign_cancelled");
    return;
  }
  await db.update(schema.paymentBatches).set({ status: "submitted", submittedAt: new Date() }).where(eq(schema.paymentBatches.id, batchId));
  await db.update(schema.payments).set({ status: "submitted" }).where(eq(schema.payments.batchId, batchId));
  await audit(db, batch.companyId, batch.signedBy, "payment_batch", batchId, "signed");
  await processDuePayments(db, batch.companyId);
}

/** Genererer pain.001-fil til upload i netbank. */
export async function exportBatchFile(db: DB, ctx: { companyId: string; userId: string }, batchId: string) {
  const batch = await getBatch(db, ctx.companyId, batchId);
  const { debtor } = await debtorFor(db, batch.bankAccountId);
  const company = (await db.query.companies.findFirst({ where: eq(schema.companies.id, ctx.companyId) }))!;
  const list = await db.select().from(schema.payments).where(eq(schema.payments.batchId, batchId));
  const xml = buildPain001({
    messageId: `FLUKS-${batchId.slice(0, 8)}-${Date.now().toString(36)}`,
    initiatorName: company.name,
    initiatorCvr: company.cvr,
    debtor,
    payments: list.map(toInstruction),
  });
  const data = Buffer.from(xml, "utf8");
  const [file] = await db
    .insert(schema.files)
    .values({ companyId: ctx.companyId, name: `betalinger-${todayISO()}.xml`, mime: "application/xml", size: data.length, sha256: batchId, data })
    .returning({ id: schema.files.id });
  await db.update(schema.paymentBatches).set({ fileId: file!.id, status: "exported", submittedAt: new Date() }).where(eq(schema.paymentBatches.id, batchId));
  await db.update(schema.payments).set({ status: "submitted" }).where(eq(schema.payments.batchId, batchId));
  await audit(db, ctx.companyId, ctx.userId, "payment_batch", batchId, "exported");
  return file!.id;
}

/**
 * Planlægger: gennemfører sandbox-betalinger på eksekveringsdatoen (opretter bankposteringer) og
 * poller status for live-betalinger. Kører via /api/cron og efter underskrift.
 */
export async function processDuePayments(db: DB, companyId?: string) {
  const today = todayISO();
  const due = await db
    .select({ p: schema.payments, b: schema.paymentBatches })
    .from(schema.payments)
    .innerJoin(schema.paymentBatches, eq(schema.paymentBatches.id, schema.payments.batchId))
    .where(
      and(
        eq(schema.payments.status, "submitted"),
        eq(schema.paymentBatches.method, "api"),
        lte(schema.payments.executionDate, today),
        companyId ? eq(schema.payments.companyId, companyId) : undefined,
      ),
    );
  const touchedBatches = new Set<string>();
  for (const { p, b } of due) {
    const acc = b.bankAccountId ? await db.query.bankAccounts.findFirst({ where: eq(schema.bankAccounts.id, b.bankAccountId) }) : null;
    const conn = acc?.connectionId ? await db.query.bankConnections.findFirst({ where: eq(schema.bankConnections.id, acc.connectionId) }) : null;
    const providerId = conn?.provider ?? "sandbox";
    if (providerId === "sandbox" && acc) {
      await db.insert(schema.bankTransactions).values({
        companyId: p.companyId,
        bankAccountId: acc.id,
        externalId: `sbx-tx-${p.id}`,
        bookingDate: p.executionDate > today ? today : p.executionDate,
        amount: -p.amount,
        currency: p.currency,
        text: p.method === "fik" ? `FI-kort +${p.fikType} ${p.creditorName}`.slice(0, 80) : `Overf. ${p.creditorName}`.slice(0, 80),
        counterparty: p.creditorName,
        reference: p.ownReference,
      }).onConflictDoNothing();
      await db
        .update(schema.bankAccounts)
        .set({ balance: (acc.balance ?? 0) - p.amount, balanceAt: new Date() })
        .where(eq(schema.bankAccounts.id, acc.id));
      await db.update(schema.payments).set({ status: "executed", executedAt: new Date() }).where(eq(schema.payments.id, p.id));
    } else if (b.externalId) {
      const status = await getBankProvider(providerId).paymentStatus(b.externalId).catch(() => "pending" as const);
      if (status === "accepted") await db.update(schema.payments).set({ status: "executed", executedAt: new Date() }).where(eq(schema.payments.id, p.id));
      if (status === "rejected") {
        await db.update(schema.payments).set({ status: "failed", error: "Afvist af banken" }).where(eq(schema.payments.id, p.id));
        const owners = await companyUsersWithRoles(db, p.companyId, ["owner", "admin", "accountant"]);
        await notify(db, { companyId: p.companyId, userIds: owners, type: "payment_failed", title: `Betaling til ${p.creditorName} blev afvist af banken`, link: `/app/payments`, email: true });
      }
    }
    touchedBatches.add(b.id);
  }
  for (const id of touchedBatches) {
    const rows = await db.select({ status: schema.payments.status }).from(schema.payments).where(eq(schema.payments.batchId, id));
    const allDone = rows.every((r) => ["executed", "failed", "cancelled"].includes(r.status));
    const anyFail = rows.some((r) => r.status === "failed");
    if (allDone) {
      await db
        .update(schema.paymentBatches)
        .set({ status: anyFail ? "partially_failed" : "completed", completedAt: new Date() })
        .where(eq(schema.paymentBatches.id, id));
    }
  }
  if (due.length) {
    const { reconcile } = await import("./bank");
    const companies = new Set(due.map((d) => d.p.companyId));
    for (const c of companies) await reconcile(db, c);
  }
  return due.length;
}

export async function cancelPayment(db: DB, ctx: { companyId: string; userId: string }, paymentId: string) {
  const p = await db.query.payments.findFirst({ where: and(eq(schema.payments.id, paymentId), eq(schema.payments.companyId, ctx.companyId)) });
  if (!p) throw new Error("Betaling findes ikke");
  if (!["planned", "in_batch"].includes(p.status)) throw new Error("Betalingen er allerede sendt til banken");
  await db.update(schema.payments).set({ status: "cancelled", batchId: null }).where(eq(schema.payments.id, paymentId));
  if (p.invoiceId) await db.update(schema.invoices).set({ status: "approved" }).where(eq(schema.invoices.id, p.invoiceId));
  await audit(db, ctx.companyId, ctx.userId, "payment", paymentId, "cancelled");
}

export async function reschedulePayment(db: DB, ctx: { companyId: string; userId: string }, paymentId: string, date: string) {
  const p = await db.query.payments.findFirst({ where: and(eq(schema.payments.id, paymentId), eq(schema.payments.companyId, ctx.companyId)) });
  if (!p || p.status !== "planned") throw new Error("Kun planlagte betalinger kan flyttes");
  if (date < todayISO()) throw new Error("Datoen skal være i dag eller senere");
  await db.update(schema.payments).set({ executionDate: nextBankDay(date) }).where(eq(schema.payments.id, paymentId));
  await audit(db, ctx.companyId, ctx.userId, "payment", paymentId, "rescheduled", { date });
}

export async function upcomingPayments(db: DB, companyId: string) {
  return db
    .select()
    .from(schema.payments)
    .where(and(eq(schema.payments.companyId, companyId), inArray(schema.payments.status, ["planned", "in_batch", "submitted"])))
    .orderBy(schema.payments.executionDate);
}

export async function recentBatches(db: DB, companyId: string) {
  return db.select().from(schema.paymentBatches).where(eq(schema.paymentBatches.companyId, companyId)).orderBy(desc(schema.paymentBatches.createdAt)).limit(30);
}
