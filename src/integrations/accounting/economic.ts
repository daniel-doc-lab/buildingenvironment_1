import "server-only";
import type { AccountingProvider, BookingInvoice, RemoteAccount, RemoteSupplier } from "./types";

/**
 * e-conomic REST API (https://restdocs.e-conomic.com).
 * Kræver app-token (X-AppSecretToken, fra e-conomic developer) og aftale-token (X-AgreementGrantToken,
 * udstedes når kunden godkender appen). Tokens "demo"/"demo" giver læseadgang til e-conomics demo-aftale.
 */
export class EconomicProvider implements AccountingProvider {
  readonly id = "economic" as const;
  readonly label = "e-conomic";
  private base = process.env.ECONOMIC_API_URL ?? "https://restapi.e-conomic.com";

  constructor(
    private appSecret: string,
    private grant: string,
    private journalNumber = 1,
  ) {}

  private headers(json = true) {
    return {
      "X-AppSecretToken": this.appSecret,
      "X-AgreementGrantToken": this.grant,
      ...(json ? { "Content-Type": "application/json" } : {}),
    };
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(this.base + path, { headers: this.headers(), cache: "no-store" });
    if (!res.ok) throw new Error(`e-conomic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.base + path, { method: "POST", headers: this.headers(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`e-conomic ${res.status}: ${(await res.text()).slice(0, 400)}`);
    return res.json() as Promise<T>;
  }

  private async all<T>(path: string): Promise<T[]> {
    const out: T[] = [];
    let url: string | undefined = `${path}${path.includes("?") ? "&" : "?"}pagesize=1000`;
    while (url) {
      const data: { collection: T[]; pagination?: { nextPage?: string } } = await this.get(url);
      out.push(...data.collection);
      url = data.pagination?.nextPage?.replace(this.base, "");
    }
    return out;
  }

  async fetchAccounts(): Promise<RemoteAccount[]> {
    const rows = await this.all<{ accountNumber: number; name: string; accountType: string; barred?: boolean; vatAccount?: { vatCode: string } }>(
      "/accounts",
    );
    return rows
      .filter((a) => !a.barred && ["profitAndLoss", "status"].includes(a.accountType))
      .map((a) => ({
        number: String(a.accountNumber),
        name: a.name,
        type: a.accountType === "profitAndLoss" ? "expense" : "balance",
        defaultVatCode: a.vatAccount?.vatCode ?? null,
      }));
  }

  async fetchVatCodes() {
    const rows = await this.all<{ vatCode: string; name: string; ratePercentage: number; vatType?: { name?: string } }>("/vat-accounts");
    return rows.map((v) => ({ code: v.vatCode, name: v.name, rate: v.ratePercentage / 100 }));
  }

  async fetchDepartments() {
    const rows = await this.all<{ departmentNumber: number; name: string }>("/departments").catch(() => []);
    return rows.map((d) => ({ code: String(d.departmentNumber), name: d.name }));
  }

  async fetchSuppliers(): Promise<RemoteSupplier[]> {
    const rows = await this.all<{
      supplierNumber: number;
      name: string;
      corporateIdentificationNumber?: string;
      email?: string;
      address?: string;
      zip?: string;
      city?: string;
      bankAccount?: string;
      costAccount?: { accountNumber: number };
    }>("/suppliers");
    return rows.map((s) => {
      const bank = s.bankAccount?.replace(/\D/g, "") ?? "";
      return {
        externalId: String(s.supplierNumber),
        name: s.name,
        cvr: s.corporateIdentificationNumber?.replace(/\D/g, "") || null,
        email: s.email ?? null,
        address: [s.address, s.zip, s.city].filter(Boolean).join(", ") || null,
        bankReg: bank.length >= 10 ? bank.slice(0, 4) : null,
        bankAccount: bank.length >= 10 ? bank.slice(4) : null,
        defaultAccount: s.costAccount ? String(s.costAccount.accountNumber) : null,
      };
    });
  }

  async ensureSupplier(s: { name: string; cvr: string | null; email: string | null; bankReg: string | null; bankAccount: string | null }) {
    if (s.cvr) {
      const existing = await this.get<{ collection: { supplierNumber: number }[] }>(
        `/suppliers?filter=corporateIdentificationNumber$eq:${encodeURIComponent(s.cvr)}`,
      ).catch(() => ({ collection: [] }));
      if (existing.collection[0]) return String(existing.collection[0].supplierNumber);
    }
    const groups = await this.get<{ collection: { supplierGroupNumber: number }[] }>("/supplier-groups");
    const created = await this.post<{ supplierNumber: number }>("/suppliers", {
      name: s.name.slice(0, 255),
      corporateIdentificationNumber: s.cvr ?? undefined,
      email: s.email ?? undefined,
      bankAccount: s.bankReg && s.bankAccount ? `${s.bankReg}${s.bankAccount}` : undefined,
      currency: "DKK",
      supplierGroup: { supplierGroupNumber: groups.collection[0]?.supplierGroupNumber ?? 1 },
      paymentTerms: { paymentTermsNumber: 1 },
    });
    return String(created.supplierNumber);
  }

  private accountingYear(date: string) {
    return date.slice(0, 4);
  }

  async bookInvoice(inv: BookingInvoice) {
    const sign = inv.kind === "credit_note" ? -1 : 1;
    const entries = inv.lines.map((l) => {
      // e-conomic beregner momsen ud fra momskoden; beløbet angives inkl. moms
      const gross = Math.round(l.amount * (1 + (l.vatRate ?? 0)));
      return {
        supplier: inv.supplierExternalId ? { supplierNumber: Number(inv.supplierExternalId) } : undefined,
        amount: (sign * gross) / 100,
        currency: { code: inv.currency },
        date: inv.issueDate,
        dueDate: inv.dueDate ?? undefined,
        supplierInvoiceNumber: inv.invoiceNumber ?? undefined,
        text: `${inv.supplierName}: ${l.description}`.slice(0, 250),
        contraAccount: { accountNumber: Number(l.accountNumber) },
        contraVatAccount: l.vatCode ? { vatCode: l.vatCode } : undefined,
        departmentalDistribution: l.departmentCode ? { departmentalDistributionNumber: Number(l.departmentCode) } : undefined,
      };
    });
    const result = await this.post<{ voucherNumber: number; accountingYear: { year: string } }[]>(
      `/journals/${this.journalNumber}/vouchers`,
      [
        {
          accountingYear: { year: this.accountingYear(inv.issueDate) },
          journal: { journalNumber: this.journalNumber },
          entries: { supplierInvoices: entries },
        },
      ],
    );
    const voucher = result[0]!;
    if (inv.file) {
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(inv.file.data)], { type: inv.file.mime }), inv.file.name);
      await fetch(
        `${this.base}/journals/${this.journalNumber}/vouchers/${voucher.accountingYear.year}-${voucher.voucherNumber}/attachment/file`,
        { method: "POST", headers: this.headers(false), body: form },
      ).catch(() => undefined);
    }
    return { voucher: String(voucher.voucherNumber) };
  }

  async registerPayment(p: {
    supplierExternalId: string | null;
    invoiceNumber: string | null;
    amount: number;
    date: string;
    bankLedgerAccount: string;
    text: string;
  }) {
    const result = await this.post<{ voucherNumber: number }[]>(`/journals/${this.journalNumber}/vouchers`, [
      {
        accountingYear: { year: this.accountingYear(p.date) },
        journal: { journalNumber: this.journalNumber },
        entries: {
          supplierPayments: [
            {
              supplier: p.supplierExternalId ? { supplierNumber: Number(p.supplierExternalId) } : undefined,
              amount: p.amount / 100,
              currency: { code: "DKK" },
              date: p.date,
              text: p.text.slice(0, 250),
              supplierInvoiceNumber: p.invoiceNumber ?? undefined,
              contraAccount: { accountNumber: Number(p.bankLedgerAccount) },
            },
          ],
        },
      },
    ]);
    return { voucher: String(result[0]?.voucherNumber ?? "") };
  }
}

export function economicConnectUrl(redirectUrl: string) {
  const pub = process.env.ECONOMIC_APP_PUBLIC_TOKEN;
  if (!pub) return null;
  const u = new URL("https://secure.e-conomic.com/secure/api1/requestaccess.aspx");
  u.searchParams.set("appPublicToken", pub);
  u.searchParams.set("redirectUrl", redirectUrl);
  return u.toString();
}
