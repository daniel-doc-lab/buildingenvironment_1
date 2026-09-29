export type RemoteUnit = { externalId: string; name: string; tenantName: string | null; areaM2: number | null };
export type RemoteProperty = {
  externalId: string;
  name: string;
  address: string | null;
  zip: string | null;
  city: string | null;
  departmentCode?: string | null;
  units: RemoteUnit[];
};

export interface PropertyProvider {
  readonly id: "sandbox" | "boligflow";
  readonly label: string;
  fetchProperties(): Promise<RemoteProperty[]>;
  /** Sender godkendt udgift til ejendomssystemet (fx til viderefakturering / forbrugsregnskab). */
  pushExpense?(e: { propertyExternalId: string; unitExternalId: string | null; amount: number; date: string; text: string; voucher: string | null }): Promise<void>;
}
