import "server-only";
import { SandboxBank } from "./sandbox";
import { EnableBankingProvider } from "./enablebanking";
import type { BankProvider } from "./types";

export * from "./types";
export { DANISH_BANKS } from "./sandbox";

export function liveBankConfigured() {
  return !!(process.env.ENABLEBANKING_APP_ID && process.env.ENABLEBANKING_PRIVATE_KEY);
}

export function getBankProvider(id: string): BankProvider {
  if (id === "enablebanking") {
    if (!liveBankConfigured()) throw new Error("Enable Banking er ikke konfigureret (ENABLEBANKING_APP_ID/ENABLEBANKING_PRIVATE_KEY)");
    return new EnableBankingProvider(process.env.ENABLEBANKING_APP_ID!, process.env.ENABLEBANKING_PRIVATE_KEY!.replace(/\\n/g, "\n"));
  }
  return new SandboxBank();
}

export function defaultBankProviderId() {
  return liveBankConfigured() ? "enablebanking" : "sandbox";
}
