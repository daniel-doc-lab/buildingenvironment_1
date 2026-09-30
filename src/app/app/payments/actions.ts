"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq, inArray } from "drizzle-orm";
import { schema } from "@/db";
import { actionContext } from "@/server/auth";
import { audit } from "@/server/audit";
import { createBatch, approveBatchSecond, signBatch, cancelPayment, reschedulePayment, exportBatchFile } from "@/server/services/payments";
import type { ActionResult } from "../actions";

async function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function done<T>(data?: T, message?: string): ActionResult<T> {
  revalidatePath("/app", "layout");
  return { ok: true, data, message };
}
function fail(e: unknown): ActionResult<never> {
  return { ok: false, error: (e as Error).message };
}

export async function createBatchAction(paymentIds: string[], bankAccountId: string, method: "api" | "file"): Promise<ActionResult<{ id: string; status: string }>> {
  try {
    const ctx = await actionContext("pay");
    const b = await createBatch(ctx.db, { companyId: ctx.company.id, userId: ctx.user.id }, { paymentIds, bankAccountId, method });
    return done({ id: b.id, status: b.status });
  } catch (e) {
    return fail(e);
  }
}

export async function approveBatchAction(batchId: string): Promise<ActionResult> {
  try {
    const ctx = await actionContext("pay");
    await approveBatchSecond(ctx.db, { companyId: ctx.company.id, userId: ctx.user.id }, batchId);
    return done(undefined, "Batch godkendt (2. godkender)");
  } catch (e) {
    return fail(e);
  }
}

export async function signBatchAction(batchId: string): Promise<ActionResult<{ url: string }>> {
  try {
    const ctx = await actionContext("signPayments");
    const url = await signBatch(ctx.db, { companyId: ctx.company.id, userId: ctx.user.id }, batchId, await appUrl());
    return done({ url });
  } catch (e) {
    return fail(e);
  }
}

export async function exportBatchAction(batchId: string): Promise<ActionResult<{ fileId: string }>> {
  try {
    const ctx = await actionContext("pay");
    const fileId = await exportBatchFile(ctx.db, { companyId: ctx.company.id, userId: ctx.user.id }, batchId);
    return done({ fileId });
  } catch (e) {
    return fail(e);
  }
}

export async function cancelBatchAction(batchId: string): Promise<ActionResult> {
  try {
    const ctx = await actionContext("pay");
    const b = await ctx.db.query.paymentBatches.findFirst({ where: and(eq(schema.paymentBatches.id, batchId), eq(schema.paymentBatches.companyId, ctx.company.id)) });
    if (!b) throw new Error("Batch findes ikke");
    if (!["draft", "awaiting_second_approval", "awaiting_signature"].includes(b.status)) throw new Error("Batchen er allerede sendt til banken");
    const ps = await ctx.db.select().from(schema.payments).where(eq(schema.payments.batchId, batchId));
    await ctx.db.update(schema.payments).set({ status: "planned", batchId: null }).where(eq(schema.payments.batchId, batchId));
    const invIds = ps.map((p) => p.invoiceId).filter((x): x is string => !!x);
    if (invIds.length) await ctx.db.update(schema.invoices).set({ status: "approved" }).where(inArray(schema.invoices.id, invIds));
    await ctx.db.update(schema.paymentBatches).set({ status: "cancelled" }).where(eq(schema.paymentBatches.id, batchId));
    await audit(ctx.db, ctx.company.id, ctx.user.id, "payment_batch", batchId, "cancelled");
    return done(undefined, "Batch annulleret – betalingerne er tilbage i køen");
  } catch (e) {
    return fail(e);
  }
}

export async function markFileBatchCompletedAction(batchId: string): Promise<ActionResult> {
  try {
    const ctx = await actionContext("pay");
    const b = await ctx.db.query.paymentBatches.findFirst({ where: and(eq(schema.paymentBatches.id, batchId), eq(schema.paymentBatches.companyId, ctx.company.id)) });
    if (!b || b.status !== "exported") throw new Error("Batchen er ikke eksporteret");
    const ps = await ctx.db.select().from(schema.payments).where(eq(schema.payments.batchId, batchId));
    await ctx.db.update(schema.payments).set({ status: "executed", executedAt: new Date() }).where(eq(schema.payments.batchId, batchId));
    const invIds = ps.map((p) => p.invoiceId).filter((x): x is string => !!x);
    if (invIds.length) await ctx.db.update(schema.invoices).set({ status: "paid", paidAt: new Date() }).where(inArray(schema.invoices.id, invIds));
    await ctx.db.update(schema.paymentBatches).set({ status: "completed", completedAt: new Date() }).where(eq(schema.paymentBatches.id, batchId));
    await audit(ctx.db, ctx.company.id, ctx.user.id, "payment_batch", batchId, "marked_paid");
    return done(undefined, "Markeret som betalt");
  } catch (e) {
    return fail(e);
  }
}

export async function cancelPaymentAction(paymentId: string): Promise<ActionResult> {
  try {
    const ctx = await actionContext("pay");
    await cancelPayment(ctx.db, { companyId: ctx.company.id, userId: ctx.user.id }, paymentId);
    return done(undefined, "Betalingen er annulleret");
  } catch (e) {
    return fail(e);
  }
}

export async function reschedulePaymentAction(paymentId: string, date: string): Promise<ActionResult> {
  try {
    const ctx = await actionContext("pay");
    await reschedulePayment(ctx.db, { companyId: ctx.company.id, userId: ctx.user.id }, paymentId, date);
    return done(undefined, "Betalingsdato ændret");
  } catch (e) {
    return fail(e);
  }
}
