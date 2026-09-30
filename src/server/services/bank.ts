import "server-only";
import { and, eq, inArray, desc } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import { getBankProvider, DANISH_BANKS } from "@/integrations/bank";
import { randomToken } from "@/lib/crypto";
import { addDays, daysBetween, todayISO } from "@/lib/utils";
import { audit } from "../audit";
import { registerPayment } from "./accounting";

export async function startBankConnection(db: DB, ctx: { companyId: string; userId: string }, opts: { providerId: string; bankId: string; appUrl: string }) {
  const provider = getBankProvider(opts.providerId);
  const bankName = (await provider.listBanks()).find((b) => b.id === opts.bankId)?.name ?? DANISH_BANKS.find((b) => b.id === opts.bankId)?.name ?? opts.bankId;
  const state = `conn:${randomToken(12)}`;
  const [conn] = await db
    .insert(schema.bankConnections)
    .values({ companyId: ctx.companyId, provider: provider.id, bankId: opts.bankId, bankName, status: "pending", state })
    .returning();
  const { url } = await provider.startConnection({ bankId: opts.bankId, bankName, state, redirectUrl: `${opts.appUrl}/api/bank/callback` });
  await audit(db, ctx.companyId, ctx.userId, "bank_connection", conn!.id, "started", { bank: bankName });
  return url;
}

export async function completeBankConnection(db: DB, state: string, code: string) {
  const conn = await db.query.bankConnections.findFirst({ where: eq(schema.bankConnections.state, state) });
  if (!conn) throw new Error("Ukendt bankforbindelse");
  const provider = getBankProvider(conn.provider);
  try {
    const result = await provider.completeConnection({ code, bankId: conn.bankId });
    await db
      .update(schema.bankConnections)
      .set({ status: "active", externalId: result.externalId, consentExpiresAt: result.expiresAt, lastSyncAt: new Date(), state: null, lastError: null })
      .where(eq(schema.bankConnections.id, conn.id));
    const ledger = ["5810", "5820", "5830", "5840"];
    for (const [i, a] of result.accounts.entries()) {
      const existing = await db.query.bankAccounts.findFirst({
        where: and(eq(schema.bankAccounts.companyId, conn.companyId), eq(schema.bankAccounts.externalId, a.externalId)),
      });
      if (existing) {
        await db.update(schema.bankAccounts).set({ connectionId: conn.id, balance: a.balance, balanceAt: new Date() }).where(eq(schema.bankAccounts.id, existing.id));
      } else {
        await db.insert(schema.bankAccounts).values({
          companyId: conn.companyId,
          connectionId: conn.id,
          externalId: a.externalId,
          name: a.name,
          bankName: conn.bankName,
          reg: a.reg,
          account: a.account,
          iban: a.iban,
          bic: a.bic,
          currency: a.currency,
          balance: a.balance,
          balanceAt: new Date(),
          ledgerAccount: ledger[i] ?? null,
        });
      }
    }
    const company = await db.query.companies.findFirst({ where: eq(schema.companies.id, conn.companyId) });
    if (company && !company.settings.defaultPaymentAccountId) {
      const first = await db.query.bankAccounts.findFirst({ where: eq(schema.bankAccounts.connectionId, conn.id) });
      if (first) {
        await db
          .update(schema.companies)
          .set({ settings: { ...company.settings, defaultPaymentAccountId: first.id } })
          .where(eq(schema.companies.id, company.id));
      }
    }
    await audit(db, conn.companyId, null, "bank_connection", conn.id, "connected", { accounts: result.accounts.length });
    await syncBank(db, conn.companyId).catch(() => undefined);
    return conn;
  } catch (e) {
    await db.update(schema.bankConnections).set({ status: "error", lastError: (e as Error).message }).where(eq(schema.bankConnections.id, conn.id));
    throw e;
  }
}

/** Henter saldi og posteringer fra alle aktive forbindelser og afstemmer. */
export async function syncBank(db: DB, companyId: string) {
  const conns = await db
    .select()
    .from(schema.bankConnections)
    .where(and(eq(schema.bankConnections.companyId, companyId), eq(schema.bankConnections.status, "active")));
  let imported = 0;
  for (const conn of conns) {
    const provider = getBankProvider(conn.provider);
    const accounts = await db.select().from(schema.bankAccounts).where(eq(schema.bankAccounts.connectionId, conn.id));
    try {
      for (const acc of accounts) {
        if (!acc.externalId) continue;
        const balance = await provider.fetchBalance({ externalId: acc.externalId });
        if (balance != null) await db.update(schema.bankAccounts).set({ balance, balanceAt: new Date() }).where(eq(schema.bankAccounts.id, acc.id));
        const since = conn.lastSyncAt ? addDays(conn.lastSyncAt.toISOString().slice(0, 10), -5) : addDays(todayISO(), -90);
        const txs = await provider.fetchTransactions({ externalId: acc.externalId }, since);
        for (const t of txs) {
          const res = await db
            .insert(schema.bankTransactions)
            .values({ companyId, bankAccountId: acc.id, ...t })
            .onConflictDoNothing()
            .returning({ id: schema.bankTransactions.id });
          imported += res.length;
        }
      }
      await db.update(schema.bankConnections).set({ lastSyncAt: new Date(), lastError: null }).where(eq(schema.bankConnections.id, conn.id));
    } catch (e) {
      await db.update(schema.bankConnections).set({ lastError: (e as Error).message }).where(eq(schema.bankConnections.id, conn.id));
    }
    if (conn.consentExpiresAt && conn.consentExpiresAt < new Date()) {
      await db.update(schema.bankConnections).set({ status: "expired" }).where(eq(schema.bankConnections.id, conn.id));
    }
  }
  const matched = await reconcile(db, companyId);
  return { imported, matched };
}

type Candidate = { invoiceId: string | null; paymentId: string | null; score: number; reason: string };

function nameSim(a: string, b: string) {
  const norm = (s: string) => s.toLowerCase().replace(/\b(a\/s|aps|i\/s)\b/g, "").replace(/[^a-z0-9æøå]+/g, " ").trim();
  const wa = new Set(norm(a).split(" ").filter((w) => w.length > 2));
  const wb = new Set(norm(b).split(" ").filter((w) => w.length > 2));
  if (!wa.size || !wb.size) return 0;
  let n = 0;
  for (const w of wa) if (wb.has(w)) n++;
  return n / Math.min(wa.size, wb.size);
}

/**
 * Automatisk bankafstemning: matcher udgående posteringer mod betalinger og fakturaer
 * via beløb, reference (FI-id/fakturanr./egen reference), modtagernavn og dato.
 */
export async function reconcile(db: DB, companyId: string) {
  const txs = await db
    .select()
    .from(schema.bankTransactions)
    .where(and(eq(schema.bankTransactions.companyId, companyId), eq(schema.bankTransactions.status, "unmatched")));
  if (!txs.length) return 0;
  const payments = await db
    .select()
    .from(schema.payments)
    .where(and(eq(schema.payments.companyId, companyId), inArray(schema.payments.status, ["submitted", "executed", "in_batch", "planned"])));
  const openInvoices = await db
    .select()
    .from(schema.invoices)
    .where(and(eq(schema.invoices.companyId, companyId), inArray(schema.invoices.status, ["approved", "scheduled", "pending_approval", "review"])));
  const usedPayments = new Set(
    (await db.select({ id: schema.bankTransactions.matchedPaymentId }).from(schema.bankTransactions).where(eq(schema.bankTransactions.companyId, companyId)))
      .map((r) => r.id)
      .filter(Boolean),
  );

  let matched = 0;
  for (const tx of txs) {
    if (tx.amount >= 0) continue;
    const amount = -tx.amount;
    const hay = `${tx.text} ${tx.reference ?? ""} ${tx.counterparty ?? ""}`.toLowerCase();
    const cands: Candidate[] = [];
    for (const p of payments) {
      if (usedPayments.has(p.id)) continue;
      let score = 0;
      const reasons: string[] = [];
      if (p.amount === amount) {
        score += 0.5;
        reasons.push("beløb");
      } else continue;
      if (p.ownReference && hay.includes(p.ownReference.toLowerCase())) {
        score += 0.4;
        reasons.push("reference");
      }
      if (p.fikPaymentId && hay.includes(p.fikPaymentId)) {
        score += 0.4;
        reasons.push("FI-id");
      }
      if (nameSim(p.creditorName, `${tx.counterparty ?? ""} ${tx.text}`) >= 0.5) {
        score += 0.2;
        reasons.push("modtager");
      }
      const dd = Math.abs(daysBetween(p.executionDate, tx.bookingDate));
      if (dd <= 3) {
        score += 0.1;
        reasons.push("dato");
      }
      cands.push({ invoiceId: p.invoiceId, paymentId: p.id, score: Math.min(1, score), reason: reasons.join(", ") });
    }
    for (const inv of openInvoices) {
      if (inv.totalAmount !== amount && inv.discountAmount !== amount) continue;
      let score = 0.4;
      if (inv.invoiceNumber && hay.includes(inv.invoiceNumber.toLowerCase())) score += 0.35;
      if (inv.fikPaymentId && hay.includes(inv.fikPaymentId)) score += 0.4;
      if (inv.supplierName && nameSim(inv.supplierName, `${tx.counterparty ?? ""} ${tx.text}`) >= 0.5) score += 0.25;
      if (inv.dueDate && Math.abs(daysBetween(inv.dueDate, tx.bookingDate)) <= 7) score += 0.05;
      cands.push({ invoiceId: inv.id, paymentId: null, score: Math.min(1, score), reason: "beløb + faktura" });
    }
    cands.sort((a, b) => b.score - a.score);
    const best = cands[0];
    const second = cands[1];
    if (best && best.score >= 0.8 && (!second || best.score - second.score >= 0.15)) {
      await applyMatch(db, companyId, tx.id, best.invoiceId, best.paymentId, best.score);
      if (best.paymentId) usedPayments.add(best.paymentId);
      matched++;
    } else if (best && best.score >= 0.5) {
      await db
        .update(schema.bankTransactions)
        .set({ matchedInvoiceId: best.invoiceId, matchedPaymentId: best.paymentId, matchConfidence: best.score })
        .where(eq(schema.bankTransactions.id, tx.id));
    }
  }
  return matched;
}

/** Bekræfter et match: posteringen afstemmes, fakturaen markeres betalt og betalingen bogføres. */
export async function applyMatch(db: DB, companyId: string, txId: string, invoiceId: string | null, paymentId: string | null, confidence = 1, userId: string | null = null) {
  const tx = await db.query.bankTransactions.findFirst({ where: and(eq(schema.bankTransactions.id, txId), eq(schema.bankTransactions.companyId, companyId)) });
  if (!tx) throw new Error("Postering findes ikke");
  let invId = invoiceId;
  if (paymentId) {
    const p = await db.query.payments.findFirst({ where: eq(schema.payments.id, paymentId) });
    invId ??= p?.invoiceId ?? null;
    await db.update(schema.payments).set({ status: "executed", executedAt: p?.executedAt ?? new Date() }).where(eq(schema.payments.id, paymentId));
  } else if (invId) {
    const p = await db.query.payments.findFirst({
      where: and(eq(schema.payments.invoiceId, invId), inArray(schema.payments.status, ["planned", "in_batch", "submitted"])),
    });
    if (p) await db.update(schema.payments).set({ status: "executed", executedAt: new Date() }).where(eq(schema.payments.id, p.id));
  }
  await db
    .update(schema.bankTransactions)
    .set({ status: "matched", matchedInvoiceId: invId, matchedPaymentId: paymentId, matchConfidence: confidence })
    .where(eq(schema.bankTransactions.id, txId));
  if (invId) {
    const inv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, invId) });
    if (inv && inv.status !== "paid") {
      await db.update(schema.invoices).set({ status: "paid", paidAt: new Date(tx.bookingDate + "T12:00:00") }).where(eq(schema.invoices.id, invId));
      await audit(db, companyId, userId, "invoice", invId, "paid", { transaction: txId, confidence });
      const acc = await db.query.bankAccounts.findFirst({ where: eq(schema.bankAccounts.id, tx.bankAccountId) });
      await registerPayment(db, invId, { amount: -tx.amount, date: tx.bookingDate, bankLedgerAccount: acc?.ledgerAccount ?? "5810" }).catch(() => undefined);
    }
  }
}

export async function ignoreTransaction(db: DB, companyId: string, txId: string) {
  await db
    .update(schema.bankTransactions)
    .set({ status: "ignored" })
    .where(and(eq(schema.bankTransactions.id, txId), eq(schema.bankTransactions.companyId, companyId)));
}

export async function markInvoicePaidManually(db: DB, ctx: { companyId: string; userId: string }, invoiceId: string, date: string) {
  const inv = await db.query.invoices.findFirst({ where: and(eq(schema.invoices.id, invoiceId), eq(schema.invoices.companyId, ctx.companyId)) });
  if (!inv) throw new Error("Faktura findes ikke");
  await db.update(schema.invoices).set({ status: "paid", paidAt: new Date(date + "T12:00:00") }).where(eq(schema.invoices.id, invoiceId));
  await db
    .update(schema.payments)
    .set({ status: "executed", executedAt: new Date() })
    .where(and(eq(schema.payments.invoiceId, invoiceId), inArray(schema.payments.status, ["planned", "in_batch", "submitted"])));
  await audit(db, ctx.companyId, ctx.userId, "invoice", invoiceId, "marked_paid", { date });
  await registerPayment(db, invoiceId, { amount: inv.totalAmount ?? 0, date, bankLedgerAccount: "5810" }).catch(() => undefined);
}

export async function bankOverview(db: DB, companyId: string) {
  const [accounts, connections, txs] = await Promise.all([
    db.select().from(schema.bankAccounts).where(eq(schema.bankAccounts.companyId, companyId)),
    db.select().from(schema.bankConnections).where(eq(schema.bankConnections.companyId, companyId)).orderBy(desc(schema.bankConnections.createdAt)),
    db.select().from(schema.bankTransactions).where(eq(schema.bankTransactions.companyId, companyId)).orderBy(desc(schema.bankTransactions.bookingDate)).limit(200),
  ]);
  return { accounts, connections, txs };
}
