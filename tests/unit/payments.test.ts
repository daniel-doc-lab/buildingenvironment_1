import { describe, expect, it } from "vitest";
import { XMLParser } from "fast-xml-parser";
import { buildPain001 } from "@/integrations/bank/pain001";
import { workflowMatches } from "@/server/services/approvals";
import { nextBankDay } from "@/server/services/payments";

describe("pain.001", () => {
  it("bygger gyldig struktur med kontrolsummer", () => {
    const xml = buildPain001({
      messageId: "TEST-1",
      initiatorName: "Nordlys & Co",
      initiatorCvr: "12345678",
      debtor: { externalId: null, iban: "DK5000400440116243", reg: "0040", account: "0440116243", bic: "DABADKKK", name: "Nordlys" },
      payments: [
        { id: "p1", amount: 123450, currency: "DKK", executionDate: "2026-10-01", creditorName: "Lys A/S", method: "fik", fikType: "71", fikCreditor: "85123456", fikPaymentId: "000000012345678" },
        { id: "p2", amount: 50000, currency: "DKK", executionDate: "2026-10-01", creditorName: "VVS <ApS>", method: "domestic", bankReg: "5301", bankAccount: "1234567", message: "Faktura 1" },
        { id: "p3", amount: 10000, currency: "EUR", executionDate: "2026-10-02", creditorName: "GmbH", method: "iban", iban: "DE89370400440532013000", bic: "COBADEFFXXX" },
      ],
    });
    const doc = new XMLParser().parse(xml);
    const hdr = doc.Document.CstmrCdtTrfInitn.GrpHdr;
    expect(hdr.NbOfTxs).toBe(3);
    expect(String(hdr.CtrlSum)).toBe("1834.5");
    expect(doc.Document.CstmrCdtTrfInitn.PmtInf).toHaveLength(3);
    expect(xml).toContain("VVS &lt;ApS&gt;");
    expect(xml).toContain("<Id>53010001234567</Id>");
  });
});

describe("Godkendelsesflows", () => {
  const inv = { totalAmount: 3_000_000, supplierId: "s1", propertyId: "p1", departmentCode: null, kind: "invoice" } as never;
  it("matcher beløbsgrænser, ejendom og type", () => {
    expect(workflowMatches({ minAmount: 2_500_000 }, inv, { isNewSupplier: false, lineProperties: [] })).toBe(true);
    expect(workflowMatches({ maxAmount: 100 }, inv, { isNewSupplier: false, lineProperties: [] })).toBe(false);
    expect(workflowMatches({ propertyIds: ["p2"] }, inv, { isNewSupplier: false, lineProperties: ["p2"] })).toBe(true);
    expect(workflowMatches({ kinds: ["expense"] }, inv, { isNewSupplier: false, lineProperties: [] })).toBe(false);
    expect(workflowMatches({ newSupplierOnly: true }, inv, { isNewSupplier: true, lineProperties: [] })).toBe(true);
  });
});

describe("Bankdage", () => {
  it("flytter weekend til mandag", () => {
    expect(nextBankDay("2026-10-03")).toBe("2026-10-05"); // lørdag
    expect(nextBankDay("2026-10-04")).toBe("2026-10-05"); // søndag
    expect(nextBankDay("2026-10-05")).toBe("2026-10-05");
  });
});
