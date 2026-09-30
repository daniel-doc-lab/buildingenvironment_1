import "server-only";
import { SandboxAccounting } from "./sandbox";
import { EconomicProvider } from "./economic";
import type { AccountingProvider } from "./types";
import { decrypt } from "@/lib/crypto";

export * from "./types";

export function getAccountingProvider(integration?: { mode: string; config: Record<string, string> } | null): AccountingProvider {
  if (integration?.mode === "live" && integration.config.grantToken) {
    const appSecret = integration.config.appSecret ? decrypt(integration.config.appSecret) : process.env.ECONOMIC_APP_SECRET_TOKEN;
    if (!appSecret) throw new Error("ECONOMIC_APP_SECRET_TOKEN mangler");
    return new EconomicProvider(appSecret, decrypt(integration.config.grantToken), Number(integration.config.journalNumber ?? 1));
  }
  return new SandboxAccounting();
}
