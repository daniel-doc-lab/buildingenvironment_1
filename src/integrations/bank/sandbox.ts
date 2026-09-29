import type { BankInfo, BankProvider, ProviderAccount, ProviderTransaction } from "./types";
import { bbanToDanishIban } from "@/lib/banking";

export const DANISH_BANKS: BankInfo[] = [
  { id: "danske", name: "Danske Bank", bic: "DABADKKK", logoColor: "#003755" },
  { id: "nordea", name: "Nordea", bic: "NDEADKKK", logoColor: "#0000A0" },
  { id: "jyske", name: "Jyske Bank", bic: "JYBADKKK", logoColor: "#00A94F" },
  { id: "sydbank", name: "Sydbank", bic: "SYBKDK22", logoColor: "#005AAA" },
  { id: "nykredit", name: "Nykredit Bank", bic: "NYKBDKKK", logoColor: "#0F1E82" },
  { id: "al", name: "Arbejdernes Landsbank", bic: "ALBADKKK", logoColor: "#E30613" },
  { id: "sparekassen", name: "Sparekassen Kronjylland", bic: "KRONDK22", logoColor: "#7A1F2B" },
  { id: "ringkjobing", name: "Ringkjøbing Landbobank", bic: "RINGDK22", logoColor: "#1C4E80" },
  { id: "lunar", name: "Lunar", bic: "LUNADK2B", logoColor: "#111111" },
  { id: "vestjysk", name: "Vestjysk Bank", bic: "VEHODK22", logoColor: "#004B87" },
  { id: "bankdata", name: "Andre banker (BEC/Bankdata)", logoColor: "#555555" },
];

const REG_BY_BANK: Record<string, string> = {
  danske: "3409",
  nordea: "2191",
  jyske: "7890",
  sydbank: "6610",
  nykredit: "8117",
  al: "5301",
  sparekassen: "9070",
  ringkjobing: "7670",
  lunar: "6695",
  vestjysk: "7600",
  bankdata: "9570",
};

function seededDigits(seed: string, len: number) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  let out = "";
  while (out.length < len) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    out += String(h % 10);
  }
  return out;
}

/**
 * Sandbox-bank: simulerer PSD2-flowet (samtykke, konti, betalinger med MitID) uden rigtige penge.
 * Betalinger gennemføres af Fluks' planlægger på eksekveringsdatoen og dukker op som posteringer.
 */
export class SandboxBank implements BankProvider {
  readonly id = "sandbox" as const;
  readonly label = "Sandbox (simuleret bank)";

  async listBanks() {
    return DANISH_BANKS;
  }

  async startConnection(opts: { bankId: string; bankName: string; state: string; redirectUrl: string }) {
    const u = new URL("/bank/sandbox-consent", opts.redirectUrl);
    u.searchParams.set("state", opts.state);
    u.searchParams.set("bank", opts.bankName);
    u.searchParams.set("redirect", opts.redirectUrl);
    return { url: u.pathname + u.search };
  }

  async completeConnection(opts: { code: string; bankId: string }) {
    const reg = REG_BY_BANK[opts.bankId] ?? "9999";
    const acc1 = seededDigits(opts.code + "drift", 10);
    const acc2 = seededDigits(opts.code + "opsparing", 10);
    const accounts: ProviderAccount[] = [
      {
        externalId: `sbx-${opts.code}-1`,
        name: "Driftskonto",
        reg,
        account: acc1,
        iban: bbanToDanishIban(reg, acc1),
        bic: DANISH_BANKS.find((b) => b.id === opts.bankId)?.bic ?? null,
        currency: "DKK",
        balance: 48_750_000,
      },
      {
        externalId: `sbx-${opts.code}-2`,
        name: "Opsparingskonto",
        reg,
        account: acc2,
        iban: bbanToDanishIban(reg, acc2),
        bic: DANISH_BANKS.find((b) => b.id === opts.bankId)?.bic ?? null,
        currency: "DKK",
        balance: 125_000_000,
      },
    ];
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 180);
    return { externalId: `sbx-consent-${opts.code}`, accounts, expiresAt };
  }

  async fetchBalance() {
    return null; // saldo vedligeholdes lokalt i sandbox
  }

  async fetchTransactions(): Promise<ProviderTransaction[]> {
    return []; // posteringer skabes når sandbox-betalinger eksekveres
  }

  async initiatePayments(opts: { state: string; redirectUrl: string }) {
    const u = new URL("/bank/sandbox-sca", opts.redirectUrl);
    u.searchParams.set("state", opts.state);
    u.searchParams.set("redirect", opts.redirectUrl);
    return { externalId: `sbx-pay-${opts.state}`, scaUrl: u.pathname + u.search };
  }

  async paymentStatus() {
    return "accepted" as const;
  }
}
