import "server-only";
import { SignJWT, importPKCS8 } from "jose";
import type { BankInfo, BankProvider, DebtorAccount, PaymentInstruction, ProviderAccount, ProviderTransaction } from "./types";
import { danishIbanToBban } from "@/lib/banking";

/**
 * Enable Banking – PSD2-aggregator med dækning af danske banker (AIS + PIS).
 * Kræver en applikation hos Enable Banking: ENABLEBANKING_APP_ID + ENABLEBANKING_PRIVATE_KEY (PEM).
 * Dokumentation: https://enablebanking.com/docs/api/reference/
 */
export class EnableBankingProvider implements BankProvider {
  readonly id = "enablebanking" as const;
  readonly label = "Enable Banking (PSD2)";
  private base = process.env.ENABLEBANKING_API_URL ?? "https://api.enablebanking.com";

  constructor(
    private appId: string,
    private privateKeyPem: string,
  ) {}

  private async token() {
    const key = await importPKCS8(this.privateKeyPem, "RS256");
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp: now + 3600 })
      .setProtectedHeader({ typ: "JWT", alg: "RS256", kid: this.appId })
      .sign(key);
  }

  private async call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const res = await fetch(this.base + path, {
      method: init?.method ?? "GET",
      headers: { Authorization: `Bearer ${await this.token()}`, "Content-Type": "application/json" },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Enable Banking ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  }

  async listBanks(): Promise<BankInfo[]> {
    const data = await this.call<{ aspsps: { name: string; bic?: string }[] }>("/aspsps?country=DK&psu_type=business");
    return data.aspsps.map((a) => ({ id: a.name, name: a.name, bic: a.bic }));
  }

  async startConnection(opts: { bankId: string; bankName: string; state: string; redirectUrl: string }) {
    const validUntil = new Date(Date.now() + 180 * 86_400_000).toISOString();
    const data = await this.call<{ url: string }>("/auth", {
      method: "POST",
      body: {
        access: { valid_until: validUntil },
        aspsp: { name: opts.bankId, country: "DK" },
        state: opts.state,
        redirect_url: opts.redirectUrl,
        psu_type: "business",
      },
    });
    return { url: data.url };
  }

  async completeConnection(opts: { code: string }) {
    const data = await this.call<{
      session_id: string;
      access?: { valid_until?: string };
      accounts: { uid: string; name?: string; currency?: string; account_id?: { iban?: string }; details?: string }[];
    }>("/sessions", { method: "POST", body: { code: opts.code } });
    const accounts: ProviderAccount[] = [];
    for (const a of data.accounts) {
      const bban = danishIbanToBban(a.account_id?.iban);
      accounts.push({
        externalId: a.uid,
        name: a.name ?? a.details ?? "Konto",
        iban: a.account_id?.iban ?? null,
        reg: bban?.reg ?? null,
        account: bban?.account ?? null,
        bic: null,
        currency: a.currency ?? "DKK",
        balance: await this.fetchBalance({ externalId: a.uid }).catch(() => null),
      });
    }
    return {
      externalId: data.session_id,
      accounts,
      expiresAt: data.access?.valid_until ? new Date(data.access.valid_until) : null,
    };
  }

  async fetchBalance(account: { externalId: string }) {
    const data = await this.call<{ balances: { balance_amount: { amount: string }; balance_type: string }[] }>(
      `/accounts/${account.externalId}/balances`,
    );
    const pref = ["ITAV", "CLAV", "ITBD", "CLBD", "XPCD"];
    const b = [...data.balances].sort((x, y) => pref.indexOf(x.balance_type) - pref.indexOf(y.balance_type))[0];
    return b ? Math.round(Number(b.balance_amount.amount) * 100) : null;
  }

  async fetchTransactions(account: { externalId: string }, since: string): Promise<ProviderTransaction[]> {
    const out: ProviderTransaction[] = [];
    let cont: string | undefined;
    do {
      const q = new URLSearchParams({ date_from: since });
      if (cont) q.set("continuation_key", cont);
      const data = await this.call<{
        transactions: {
          entry_reference?: string;
          transaction_id?: string;
          transaction_amount: { amount: string; currency: string };
          credit_debit_indicator: "DBIT" | "CRDT";
          booking_date?: string;
          value_date?: string;
          remittance_information?: string[];
          creditor?: { name?: string };
          debtor?: { name?: string };
        }[];
        continuation_key?: string;
      }>(`/accounts/${account.externalId}/transactions?${q}`);
      for (const t of data.transactions) {
        const amt = Math.round(Number(t.transaction_amount.amount) * 100) * (t.credit_debit_indicator === "DBIT" ? -1 : 1);
        const text = (t.remittance_information ?? []).join(" ").trim();
        out.push({
          externalId: t.entry_reference ?? t.transaction_id ?? `${t.booking_date}-${amt}-${text}`,
          bookingDate: t.booking_date ?? t.value_date ?? since,
          amount: amt,
          currency: t.transaction_amount.currency,
          text: text || (t.creditor?.name ?? t.debtor?.name ?? "Postering"),
          counterparty: (t.credit_debit_indicator === "DBIT" ? t.creditor?.name : t.debtor?.name) ?? null,
          reference: t.remittance_information?.[0] ?? null,
        });
      }
      cont = data.continuation_key;
    } while (cont);
    return out;
  }

  async initiatePayments(opts: {
    debtor: DebtorAccount;
    bankName: string;
    payments: PaymentInstruction[];
    state: string;
    redirectUrl: string;
  }) {
    // Enable Banking understøtter bulk-betalinger for mange danske banker; FIK sendes som struktureret reference.
    const transactions = opts.payments.map((p) => ({
      instructed_amount: { amount: (p.amount / 100).toFixed(2), currency: p.currency },
      beneficiary: {
        creditor: { name: p.creditorName.slice(0, 70) },
        creditor_account:
          p.method === "iban"
            ? { iban: p.iban, scheme_name: "IBAN" }
            : p.method === "domestic"
              ? { identification: `${p.bankReg}${(p.bankAccount ?? "").padStart(10, "0")}`, scheme_name: "BBAN" }
              : { identification: p.fikCreditor, scheme_name: `DK:FIK${p.fikType ?? "71"}` },
        creditor_agent: p.bic ? { bic_fi: p.bic } : undefined,
      },
      requested_execution_date: p.executionDate,
      reference_number: p.method === "fik" ? p.fikPaymentId ?? undefined : undefined,
      remittance_information: [p.message ?? p.ownReference ?? ""].filter(Boolean),
      end_to_end_id: p.id.replace(/-/g, "").slice(0, 35),
    }));
    const data = await this.call<{ payment_id: string; url: string }>("/payments", {
      method: "POST",
      body: {
        payment_type: opts.payments.some((p) => p.method === "iban" && !p.iban?.startsWith("DK")) ? "CROSSBORDER" : "DOMESTIC",
        payment_request: {
          debtor_account: opts.debtor.iban ? { iban: opts.debtor.iban } : undefined,
          credit_transfer_transaction: transactions,
        },
        aspsp: { name: opts.bankName, country: "DK" },
        state: opts.state,
        redirect_url: opts.redirectUrl,
        psu_type: "business",
      },
    });
    return { externalId: data.payment_id, scaUrl: data.url };
  }

  async paymentStatus(externalId: string) {
    const data = await this.call<{ status: string }>(`/payments/${externalId}`);
    if (["ACSC", "ACCC", "ACSP", "ACTC", "ACWC", "ACCP", "ACFC", "PATC"].includes(data.status)) return "accepted" as const;
    if (["RJCT", "CANC"].includes(data.status)) return "rejected" as const;
    return "pending" as const;
  }
}
