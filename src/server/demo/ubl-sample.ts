import { invoiceTotals, type DemoInvoiceSpec } from "./invoice-pdf";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const a = (ore: number) => (ore / 100).toFixed(2);

/** Bygger en OIOUBL 2.1-faktura (som modtaget via NemHandel) ud fra en demo-specifikation. */
export function buildDemoUbl(spec: DemoInvoiceSpec) {
  const t = invoiceTotals(spec);
  const [street, rest] = spec.supplier.address.split(", ");
  const pm =
    spec.payment.kind === "fik"
      ? `<cac:PaymentMeans><cbc:ID>1</cbc:ID><cbc:PaymentMeansCode>93</cbc:PaymentMeansCode><cbc:PaymentDueDate>${spec.dueDate}</cbc:PaymentDueDate><cbc:PaymentChannelCode>DK:FIK</cbc:PaymentChannelCode><cbc:InstructionID>${
          spec.payment.paymentId ?? ""
        }</cbc:InstructionID><cbc:PaymentID>${spec.payment.type}</cbc:PaymentID><cac:CreditAccount><cbc:AccountID>${spec.payment.creditor}</cbc:AccountID></cac:CreditAccount></cac:PaymentMeans>`
      : spec.payment.kind === "bank"
        ? `<cac:PaymentMeans><cbc:ID>1</cbc:ID><cbc:PaymentMeansCode>31</cbc:PaymentMeansCode><cbc:PaymentDueDate>${spec.dueDate}</cbc:PaymentDueDate><cbc:PaymentChannelCode>DK:BANK</cbc:PaymentChannelCode><cac:PayeeFinancialAccount><cbc:ID>${spec.payment.account}</cbc:ID><cac:FinancialInstitutionBranch><cbc:ID>${spec.payment.reg}</cbc:ID></cac:FinancialInstitutionBranch></cac:PayeeFinancialAccount></cac:PaymentMeans>`
        : "";
  const lines = spec.lines
    .map((l, i) => {
      const amount = Math.round(l.quantity * l.unitPrice * 100);
      return `<cac:InvoiceLine><cbc:ID>${i + 1}</cbc:ID><cbc:InvoicedQuantity unitCode="EA">${l.quantity}</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="DKK">${a(
        amount,
      )}</cbc:LineExtensionAmount><cac:Item><cbc:Name>${esc(l.description)}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>StandardRated</cbc:ID><cbc:Percent>25</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="DKK">${l.unitPrice.toFixed(
        2,
      )}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
<cbc:UBLVersionID>2.0</cbc:UBLVersionID><cbc:CustomizationID>OIOUBL-2.01</cbc:CustomizationID><cbc:ProfileID schemeAgencyID="320" schemeID="urn:oioubl:id:profileid-1.2">Procurement-BilSim-1.0</cbc:ProfileID>
<cbc:ID>${esc(spec.invoiceNumber)}</cbc:ID><cbc:IssueDate>${spec.issueDate}</cbc:IssueDate><cbc:InvoiceTypeCode listAgencyID="320" listID="urn:oioubl:codelist:invoicetypecode-1.1">380</cbc:InvoiceTypeCode><cbc:DocumentCurrencyCode>DKK</cbc:DocumentCurrencyCode>
<cac:AccountingSupplierParty><cac:Party><cbc:EndpointID schemeAgencyID="320" schemeID="DK:CVR">DK${spec.supplier.cvr}</cbc:EndpointID><cac:PartyName><cbc:Name>${esc(
    spec.supplier.name,
  )}</cbc:Name></cac:PartyName><cac:PostalAddress><cbc:StreetName>${esc(street ?? "")}</cbc:StreetName><cbc:CityName>${esc(
    rest?.split(" ").slice(1).join(" ") ?? "",
  )}</cbc:CityName><cbc:PostalZone>${rest?.split(" ")[0] ?? ""}</cbc:PostalZone></cac:PostalAddress><cac:PartyLegalEntity><cbc:RegistrationName>${esc(
    spec.supplier.name,
  )}</cbc:RegistrationName><cbc:CompanyID schemeID="DK:CVR">DK${spec.supplier.cvr}</cbc:CompanyID></cac:PartyLegalEntity><cac:Contact><cbc:ElectronicMail>${esc(
    spec.supplier.email,
  )}</cbc:ElectronicMail></cac:Contact></cac:Party></cac:AccountingSupplierParty>
<cac:AccountingCustomerParty><cac:Party><cbc:EndpointID schemeAgencyID="320" schemeID="DK:CVR">DK${spec.customer.cvr ?? ""}</cbc:EndpointID><cac:PartyName><cbc:Name>${esc(
    spec.customer.name,
  )}</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
${spec.deliveryAddress ? `<cac:Delivery><cac:DeliveryLocation><cac:Address><cbc:StreetName>${esc(spec.deliveryAddress)}</cbc:StreetName></cac:Address></cac:DeliveryLocation></cac:Delivery>` : ""}
${pm}
<cac:TaxTotal><cbc:TaxAmount currencyID="DKK">${a(t.vat)}</cbc:TaxAmount></cac:TaxTotal>
<cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="DKK">${a(t.net)}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="DKK">${a(
    t.net,
  )}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="DKK">${a(t.total)}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="DKK">${a(
    t.total,
  )}</cbc:PayableAmount></cac:LegalMonetaryTotal>
${lines}
</Invoice>`;
}
