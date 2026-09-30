import { NextResponse } from "next/server";
import { schema } from "@/db";
import { getContext, can } from "@/server/auth";
import { encrypt } from "@/lib/crypto";
import { syncMasterData } from "@/server/services/accounting";

/** e-conomic redirecter hertil med ?token=<AgreementGrantToken> når kunden har godkendt appen. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const ctx = await getContext();
  if (!ctx?.company || !can(ctx.role, "manageIntegrations")) return NextResponse.redirect(new URL("/login", url.origin));
  const token = url.searchParams.get("token");
  if (!token) return NextResponse.redirect(new URL("/app/settings/integrations?error=economic", url.origin));
  const values = { mode: "live", status: "connected", config: { grantToken: encrypt(token), journalNumber: "1" } };
  await ctx.db
    .insert(schema.integrations)
    .values({ companyId: ctx.company.id, provider: "economic", ...values })
    .onConflictDoUpdate({ target: [schema.integrations.companyId, schema.integrations.provider], set: { ...values, lastError: null } });
  await syncMasterData(ctx.db, ctx.company.id).catch(() => undefined);
  return NextResponse.redirect(new URL("/app/settings/integrations?connected=economic", url.origin));
}
