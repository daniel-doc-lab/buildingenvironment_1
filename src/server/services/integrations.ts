import "server-only";
import { and, eq } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import { getAccountingProvider } from "@/integrations/accounting";
import { getPropertyProvider } from "@/integrations/property";
import { getAI, aiStatus } from "@/integrations/ai";
import { decrypt } from "@/lib/crypto";

export type IntegrationProvider = "economic" | "boligflow" | "nemhandel" | "ai" | "email";

export async function getIntegration(db: DB, companyId: string, provider: IntegrationProvider) {
  return db.query.integrations.findFirst({
    where: and(eq(schema.integrations.companyId, companyId), eq(schema.integrations.provider, provider)),
  });
}

export async function accountingFor(db: DB, companyId: string) {
  const integ = await getIntegration(db, companyId, "economic");
  if (!integ || integ.status !== "connected") return null;
  return { provider: getAccountingProvider(integ), integration: integ };
}

export async function propertyFor(db: DB, companyId: string) {
  const integ = await getIntegration(db, companyId, "boligflow");
  if (!integ || integ.status !== "connected") return null;
  return { provider: getPropertyProvider(integ), integration: integ };
}

export async function aiFor(db: DB, companyId: string) {
  const integ = await getIntegration(db, companyId, "ai");
  const key = integ?.config.apiKey ? decrypt(integ.config.apiKey) : null;
  return { ai: getAI(key), status: aiStatus(key) };
}
