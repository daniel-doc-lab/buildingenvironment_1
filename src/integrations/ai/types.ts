import { z } from "zod";

export const ExtractedLineSchema = z.object({
  description: z.string(),
  quantity: z.number().nullable(),
  unitPrice: z.number().nullable().describe("Stykpris ekskl. moms i hovedvaluta (fx kroner)"),
  amount: z.number().describe("Linjebeløb ekskl. moms i hovedvaluta"),
  vatRate: z.number().nullable().describe("Momssats som decimal, fx 0.25"),
});

export const ExtractionSchema = z.object({
  documentType: z.enum(["invoice", "credit_note", "receipt", "reminder", "other"]),
  supplierName: z.string().nullable(),
  supplierCvr: z.string().nullable().describe("8-cifret dansk CVR-nummer uden 'DK'"),
  supplierAddress: z.string().nullable(),
  supplierEmail: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  issueDate: z.string().nullable().describe("YYYY-MM-DD"),
  dueDate: z.string().nullable().describe("YYYY-MM-DD"),
  currency: z.string().describe("ISO-valutakode, fx DKK"),
  amountExVat: z.number().nullable(),
  vatAmount: z.number().nullable(),
  totalAmount: z.number().nullable().describe("Beløb der skal betales inkl. moms"),
  paymentMethod: z.enum(["fik", "domestic", "iban", "betalingsservice", "card", "paid", "unknown"]),
  fikLine: z.string().nullable().describe("FI-kodelinje, fx +71<000000012345678+85012345<"),
  bankReg: z.string().nullable(),
  bankAccount: z.string().nullable(),
  iban: z.string().nullable(),
  bic: z.string().nullable(),
  paymentReference: z.string().nullable(),
  discountDate: z.string().nullable().describe("Sidste dato for kontantrabat, YYYY-MM-DD"),
  discountAmount: z.number().nullable().describe("Beløb der skal betales hvis rabatten udnyttes"),
  deliveryAddress: z.string().nullable().describe("Leverings-/arbejdsadresse, fx ejendommens adresse"),
  lines: z.array(ExtractedLineSchema),
  summary: z.string().describe("Én kort dansk sætning om hvad fakturaen dækker"),
  confidence: z.object({
    supplier: z.number(),
    invoiceNumber: z.number(),
    dates: z.number(),
    amounts: z.number(),
    payment: z.number(),
  }),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

export type ExtractInput = {
  bytes: Buffer;
  mime: string;
  fileName: string;
  text?: string | null; // udtrukket tekst (PDF), hvis tilgængelig
  companyName?: string;
  companyCvr?: string | null;
};

export type CodingContext = {
  accounts: { number: string; name: string; defaultVatCode: string | null }[];
  vatCodes: { code: string; name: string; rate: number }[];
  properties: { id: string; name: string; address: string | null }[];
  departments: { code: string; name: string }[];
  supplierName: string | null;
  supplierIndustry?: string | null;
  history: { description: string; accountNumber: string | null; vatCode: string | null; propertyId: string | null }[];
  documentText?: string | null;
  deliveryAddress?: string | null;
};

export type CodingSuggestion = {
  accountNumber: string | null;
  vatCode: string | null;
  propertyId: string | null;
  departmentCode: string | null;
  confidence: number;
  reason: string;
};

export const CodingSchema = z.object({
  lines: z.array(
    z.object({
      index: z.number(),
      accountNumber: z.string().nullable(),
      vatCode: z.string().nullable(),
      propertyId: z.string().nullable(),
      departmentCode: z.string().nullable(),
      confidence: z.number(),
      reason: z.string().describe("Kort dansk begrundelse"),
    }),
  ),
});

export interface AIProvider {
  readonly name: "claude" | "demo";
  readonly model?: string;
  extract(input: ExtractInput): Promise<Extraction>;
  suggestCoding(lines: { description: string; amount: number }[], ctx: CodingContext): Promise<CodingSuggestion[]>;
}
