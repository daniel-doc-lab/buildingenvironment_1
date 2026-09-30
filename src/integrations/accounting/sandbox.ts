import type { AccountingProvider, BookingInvoice } from "./types";
import { STANDARD_ACCOUNTS, STANDARD_DEPARTMENTS, STANDARD_VAT } from "./standard-chart";

let voucherSeq = 1000 + Math.floor(Math.random() * 500);

/** Simuleret regnskabsprogram – bogføring får bilagsnumre, men sendes ingen steder hen. */
export class SandboxAccounting implements AccountingProvider {
  readonly id = "sandbox" as const;
  readonly label = "Sandbox-regnskab";
  async fetchAccounts() {
    return STANDARD_ACCOUNTS;
  }
  async fetchVatCodes() {
    return STANDARD_VAT;
  }
  async fetchDepartments() {
    return STANDARD_DEPARTMENTS;
  }
  async fetchSuppliers() {
    return [];
  }
  async ensureSupplier(s: { name: string }) {
    return `SBX-${s.name.slice(0, 12).toUpperCase().replace(/\W/g, "")}`;
  }
  async bookInvoice(inv: BookingInvoice) {
    void inv;
    return { voucher: String(++voucherSeq) };
  }
  async registerPayment() {
    return { voucher: String(++voucherSeq) };
  }
}
