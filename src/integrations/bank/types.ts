export type BankInfo = { id: string; name: string; bic?: string; logoColor?: string };

export type ProviderAccount = {
  externalId: string;
  name: string;
  iban: string | null;
  reg: string | null;
  account: string | null;
  bic: string | null;
  currency: string;
  balance: number | null; // øre
};

export type ProviderTransaction = {
  externalId: string;
  bookingDate: string;
  amount: number; // øre, negativ = udgående
  currency: string;
  text: string;
  counterparty: string | null;
  reference: string | null;
};

export type PaymentInstruction = {
  id: string;
  amount: number; // øre
  currency: string;
  executionDate: string;
  creditorName: string;
  method: "fik" | "domestic" | "iban";
  fikType?: string | null;
  fikCreditor?: string | null;
  fikPaymentId?: string | null;
  bankReg?: string | null;
  bankAccount?: string | null;
  iban?: string | null;
  bic?: string | null;
  message?: string | null;
  ownReference?: string | null;
};

export type DebtorAccount = { externalId: string | null; iban: string | null; reg: string | null; account: string | null; bic: string | null; name: string };

export interface BankProvider {
  readonly id: "sandbox" | "enablebanking";
  readonly label: string;
  listBanks(): Promise<BankInfo[]>;
  /** Starter samtykke (PSD2 AIS). Returnerer URL som brugeren sendes til (bankens MitID-login). */
  startConnection(opts: { bankId: string; bankName: string; state: string; redirectUrl: string }): Promise<{ url: string }>;
  /** Afslutter samtykke med koden fra redirect. */
  completeConnection(opts: { code: string; bankId: string }): Promise<{ externalId: string; accounts: ProviderAccount[]; expiresAt: Date | null }>;
  fetchBalance(account: { externalId: string }): Promise<number | null>;
  fetchTransactions(account: { externalId: string }, since: string): Promise<ProviderTransaction[]>;
  /** Starter betaling (PSD2 PIS). Returnerer SCA-URL hvor brugeren godkender med MitID. */
  initiatePayments(opts: {
    debtor: DebtorAccount;
    bankName: string;
    payments: PaymentInstruction[];
    state: string;
    redirectUrl: string;
  }): Promise<{ externalId: string; scaUrl: string }>;
  paymentStatus(externalId: string): Promise<"pending" | "accepted" | "rejected">;
}
