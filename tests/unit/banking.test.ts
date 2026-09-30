import { describe, expect, it } from "vitest";
import { parseFik, validCvr, validIban, bbanToDanishIban, danishIbanToBban, luhn, paymentFingerprint } from "@/lib/banking";
import { parseAmount, formatMoney } from "@/lib/utils";
import { makeCvr, makeFikId } from "@/server/demo/catalog";

describe("FI-kort", () => {
  it("parser kodelinje med og uden mellemrum", () => {
    expect(parseFik("+71<000000012345678+85012345<")).toEqual({ type: "71", paymentId: "000000012345678", creditor: "85012345" });
    expect(parseFik("+71 000000012345678 +85012345<")?.creditor).toBe("85012345");
    expect(parseFik("+73<+87654321<")).toEqual({ type: "73", paymentId: null, creditor: "87654321" });
  });
  it("afviser ukendte kortarter", () => {
    expect(parseFik("+99<123+12345678<")).toBeNull();
  });
  it("genererer gyldige 71-betalings-id'er", () => {
    for (let i = 0; i < 20; i++) expect(luhn(makeFikId(i))).toBe(true);
  });
});

describe("CVR og IBAN", () => {
  it("validerer CVR med modulus 11", () => {
    for (const base of ["2945117", "3310552", "4015623"]) expect(validCvr(makeCvr(base))).toBe(true);
    expect(validCvr("12345678")).toBe(false);
  });
  it("konverterer dansk reg/konto til gyldig IBAN og tilbage", () => {
    const iban = bbanToDanishIban("3409", "0012456789");
    expect(validIban(iban)).toBe(true);
    expect(danishIbanToBban(iban)).toEqual({ reg: "3409", account: "0012456789" });
    expect(validIban("DK5000400440116243")).toBe(true);
    expect(validIban("DK5000400440116244")).toBe(false);
  });
  it("fingeraftryk ændres når kontonummeret ændres", () => {
    const a = paymentFingerprint({ bankReg: "5301", bankAccount: "0001234567" });
    const b = paymentFingerprint({ bankReg: "9570", bankAccount: "0098765432" });
    expect(a).not.toBe(b);
    expect(paymentFingerprint({ bankReg: "5301", bankAccount: "1234567" })).toBe(a);
  });
});

describe("Beløb", () => {
  it("parser danske og engelske formater til øre", () => {
    expect(parseAmount("1.234,50")).toBe(123450);
    expect(parseAmount("1,234.50")).toBe(123450);
    expect(parseAmount("12.500")).toBe(1250000);
    expect(parseAmount("99,95 kr.")).toBe(9995);
    expect(parseAmount("-450,00")).toBe(-45000);
  });
  it("formaterer øre som kroner", () => {
    expect(formatMoney(123450).replace(/ /g, " ")).toBe("1.234,50 kr.");
  });
});
