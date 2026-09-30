"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { actionContext } from "@/server/auth";
import { startBankConnection, syncBank, applyMatch, ignoreTransaction } from "@/server/services/bank";
import { processDuePayments } from "@/server/services/payments";
import { defaultBankProviderId } from "@/integrations/bank";
import type { ActionResult } from "../actions";

async function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
}

export async function connectBankAction(bankId: string): Promise<ActionResult<{ url: string }>> {
  try {
    const ctx = await actionContext("manageIntegrations");
    const url = await startBankConnection(ctx.db, { companyId: ctx.company.id, userId: ctx.user.id }, { providerId: defaultBankProviderId(), bankId, appUrl: await appUrl() });
    return { ok: true, data: { url } };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function syncBankAction(): Promise<ActionResult<{ imported: number; matched: number }>> {
  try {
    const ctx = await actionContext("view");
    await processDuePayments(ctx.db, ctx.company.id);
    const r = await syncBank(ctx.db, ctx.company.id);
    revalidatePath("/app", "layout");
    return { ok: true, data: r, message: `${r.imported} nye posteringer · ${r.matched} afstemt automatisk` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function matchTransactionAction(txId: string, invoiceId: string | null, paymentId: string | null): Promise<ActionResult> {
  try {
    const ctx = await actionContext("pay");
    await applyMatch(ctx.db, ctx.company.id, txId, invoiceId, paymentId, 1, ctx.user.id);
    revalidatePath("/app", "layout");
    return { ok: true, message: "Afstemt – fakturaen er markeret som betalt" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function ignoreTransactionAction(txId: string): Promise<ActionResult> {
  try {
    const ctx = await actionContext("pay");
    await ignoreTransaction(ctx.db, ctx.company.id, txId);
    revalidatePath("/app", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
