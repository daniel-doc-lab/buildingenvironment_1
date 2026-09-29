import { describe, expect, it } from "vitest";
import { renderDemoInvoice, invoiceTotals } from "@/server/demo/invoice-pdf";
import { DEMO_SUPPLIERS, DEMO_COMPANY } from "@/server/demo/catalog";
import { specFor } from "@/server/seed";
import { pdfText } from "@/integrations/ai";
import { DemoProvider, parseDanishDate, suggestLine } from "@/integrations/ai/demo";
import { STANDARD_ACCOUNTS, STANDARD_VAT } from "@/integrations/accounting/standard-chart";
import { buildDemoUbl } from "@/server/demo/ubl-sample";
import { parseUbl, isUbl } from "@/integrations/einvoice/ubl";

const rand = (() => {
  let s = 7;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
})();

describe("Demo-AI aflæsning af PDF-fakturaer", () => {
  for (const key of ["energi", "vvs", "rengoring", "software"]) {
    it(`læser faktura fra ${key}`, async () => {
      const s = DEMO_SUPPLIERS.find((x) => x.key === key)!;
      const spec = specFor(s, { invoiceNumber: "T-12345", issueDate: "2026-09-01", rand, property: null });
      const pdf = await renderDemoInvoice(spec);
      const text = await pdfText(pdf);
      const x = await new DemoProvider().extract({ bytes: pdf, mime: "application/pdf", fileName: "a.pdf", text, companyCvr: DEMO_COMPANY.cvr });
      const t = invoiceTotals(spec);
      expect(x.supplierCvr).toBe(s.cvr);
      expect(x.invoiceNumber).toBe("T-12345");
      expect(x.issueDate).toBe("2026-09-01");
      expect(x.dueDate).toBe(spec.dueDate);
      expect(Math.round((x.totalAmount ?? 0) * 100)).toBe(t.total);
      expect(Math.round((x.vatAmount ?? 0) * 100)).toBe(t.vat);
      expect(x.lines.length).toBe(spec.lines.length);
      if (s.payment.kind === "fik") expect(x.fikLine).toContain(s.payment.creditor);
      if (s.payment.kind === "bank") expect(x.bankAccount).toBe(s.payment.account);
    });
  }
  it("parser danske datoformater", () => {
    expect(parseDanishDate("12-09-2026")).toBe("2026-09-12");
    expect(parseDanishDate("3. oktober 2026")).toBe("2026-10-03");
    expect(parseDanishDate("2026-01-31")).toBe("2026-01-31");
  });
});

describe("Kontering", () => {
  const ctx = { accounts: STANDARD_ACCOUNTS, vatCodes: STANDARD_VAT, properties: [], departments: [], supplierName: null, history: [] };
  it("bruger historik før nøgleord", () => {
    const s = suggestLine("Diverse", { ...ctx, history: [{ description: "x", accountNumber: "2630", vatCode: "I25", propertyId: null }] });
    expect(s.accountNumber).toBe("2630");
    expect(s.confidence).toBeGreaterThan(0.8);
  });
  it("genkender nøgleord", () => {
    expect(suggestLine("Trappevask uge 36", ctx).accountNumber).toBe("2530");
    expect(suggestLine("Microsoft 365 licens", ctx).accountNumber).toBe("2630");
  });
});

describe("OIOUBL e-faktura", () => {
  it("parser genereret OIOUBL præcist", () => {
    const s = DEMO_SUPPLIERS.find((x) => x.key === "affald")!;
    const spec = specFor(s, { invoiceNumber: "AF-1", issueDate: "2026-09-10", rand, property: null });
    const xml = buildDemoUbl(spec);
    expect(isUbl(xml)).toBe(true);
    const x = parseUbl(xml);
    const t = invoiceTotals(spec);
    expect(x.supplierCvr).toBe(s.cvr);
    expect(x.invoiceNumber).toBe("AF-1");
    expect(Math.round(x.totalAmount! * 100)).toBe(t.total);
    expect(x.paymentMethod).toBe("fik");
    expect(x.fikLine).toContain("89567890");
    expect(x.lines).toHaveLength(spec.lines.length);
  });
});
