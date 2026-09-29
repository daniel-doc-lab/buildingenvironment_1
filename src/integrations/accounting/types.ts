export type RemoteAccount = { number: string; name: string; type: "expense" | "balance" | "revenue"; defaultVatCode: string | null };
export type RemoteVat = { code: string; name: string; rate: number };
export type RemoteDepartment = { code: string; name: string };
export type RemoteSupplier = {
  externalId: string;
  name: string;
  cvr: string | null;
  email: string | null;
  address: string | null;
  bankReg: string | null;
  bankAccount: string | null;
  defaultAccount?: string | null;
};

export type BookingInvoice = {
  id: string;
  kind: string;
  supplierExternalId: string | null;
  supplierName: string;
  invoiceNumber: string | null;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  totalAmount: number; // øre inkl. moms
  description: string | null;
  lines: { description: string; amount: number; accountNumber: string; vatCode: string | null; vatRate: number; departmentCode: string | null }[];
  file?: { name: string; mime: string; data: Buffer } | null;
};

export interface AccountingProvider {
  readonly id: "sandbox" | "economic";
  readonly label: string;
  fetchAccounts(): Promise<RemoteAccount[]>;
  fetchVatCodes(): Promise<RemoteVat[]>;
  fetchDepartments(): Promise<RemoteDepartment[]>;
  fetchSuppliers(): Promise<RemoteSupplier[]>;
  /** Opretter leverandør i regnskabet og returnerer ekstern id. */
  ensureSupplier(s: { name: string; cvr: string | null; email: string | null; bankReg: string | null; bankAccount: string | null }): Promise<string>;
  /** Bogfører leverandørfaktura (kladde) med bilag. Returnerer bilagsnummer. */
  bookInvoice(inv: BookingInvoice): Promise<{ voucher: string }>;
  /** Registrerer betaling af leverandørfaktura. */
  registerPayment(p: {
    supplierExternalId: string | null;
    invoiceNumber: string | null;
    amount: number;
    date: string;
    bankLedgerAccount: string;
    text: string;
  }): Promise<{ voucher: string }>;
}
