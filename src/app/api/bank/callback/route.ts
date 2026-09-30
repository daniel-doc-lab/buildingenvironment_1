import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { completeBankConnection } from "@/server/services/bank";
import { completeBatchSignature } from "@/server/services/payments";
import { getContext } from "@/server/auth";

/** Modtager redirect fra banken (PSD2) efter samtykke eller betalingsgodkendelse. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const back = (path: string) => NextResponse.redirect(new URL(path, url.origin));
  const ctx = await getContext();
  if (!ctx) return back("/login");
  const db = await getDb();

  if (state.startsWith("batch:")) {
    const batchId = state.split(":")[1]!;
    try {
      await completeBatchSignature(db, batchId, !error && !!code);
    } catch {
      return back(`/app/payments?error=sign`);
    }
    return back(`/app/payments/batches/${batchId}${error ? "?cancelled=1" : "?signed=1"}`);
  }
  if (state.startsWith("conn:")) {
    if (error || !code) return back("/app/bank?error=cancelled");
    try {
      await completeBankConnection(db, state, code);
      return back("/app/bank?connected=1");
    } catch (e) {
      return back(`/app/bank?error=${encodeURIComponent((e as Error).message.slice(0, 120))}`);
    }
  }
  return back("/app");
}
