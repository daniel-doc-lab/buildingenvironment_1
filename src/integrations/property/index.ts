import "server-only";
import { SandboxProperty } from "./sandbox";
import { BoligflowProvider } from "./boligflow";
import type { PropertyProvider } from "./types";
import { decrypt } from "@/lib/crypto";

export * from "./types";

export function getPropertyProvider(integration?: { mode: string; config: Record<string, string> } | null): PropertyProvider {
  if (integration?.mode === "live" && integration.config.apiKey) {
    return new BoligflowProvider(decrypt(integration.config.apiKey), integration.config.baseUrl || undefined);
  }
  return new SandboxProperty();
}
