import type { RemoteAccount, RemoteDepartment, RemoteVat } from "./types";

/** Forenklet dansk standardkontoplan (udgiftsdelen + relevante balancekonti). */
export const STANDARD_ACCOUNTS: RemoteAccount[] = [
  { number: "1310", name: "Varekøb", type: "expense", defaultVatCode: "I25" },
  { number: "1320", name: "Varekøb EU", type: "expense", defaultVatCode: "IEUV" },
  { number: "1350", name: "Fragt og porto", type: "expense", defaultVatCode: "I25" },
  { number: "2210", name: "Løn og gager", type: "expense", defaultVatCode: null },
  { number: "2260", name: "Personaleudgifter og forplejning", type: "expense", defaultVatCode: "I25" },
  { number: "2270", name: "Kursus og uddannelse", type: "expense", defaultVatCode: "I25" },
  { number: "2310", name: "Annoncer og reklame", type: "expense", defaultVatCode: "I25" },
  { number: "2340", name: "Repræsentation", type: "expense", defaultVatCode: "REP" },
  { number: "2350", name: "Rejseudgifter", type: "expense", defaultVatCode: "I25" },
  { number: "2410", name: "Autodrift og brændstof", type: "expense", defaultVatCode: "I25" },
  { number: "2420", name: "Parkering og bro", type: "expense", defaultVatCode: "I25" },
  { number: "2510", name: "Husleje", type: "expense", defaultVatCode: "I25" },
  { number: "2520", name: "El, vand og varme (lokaler)", type: "expense", defaultVatCode: "I25" },
  { number: "2530", name: "Rengøring", type: "expense", defaultVatCode: "I25" },
  { number: "2540", name: "Vedligeholdelse af lokaler", type: "expense", defaultVatCode: "I25" },
  { number: "2610", name: "Kontorartikler og tryksager", type: "expense", defaultVatCode: "I25" },
  { number: "2620", name: "Telefon og internet", type: "expense", defaultVatCode: "I25" },
  { number: "2630", name: "Software og IT-abonnementer", type: "expense", defaultVatCode: "I25" },
  { number: "2640", name: "Småanskaffelser", type: "expense", defaultVatCode: "I25" },
  { number: "2710", name: "Revision og regnskabsassistance", type: "expense", defaultVatCode: "I25" },
  { number: "2720", name: "Advokat og rådgivning", type: "expense", defaultVatCode: "I25" },
  { number: "2730", name: "Forsikringer", type: "expense", defaultVatCode: "U0" },
  { number: "2740", name: "Kontingenter og abonnementer", type: "expense", defaultVatCode: "I25" },
  { number: "2790", name: "Øvrige administrationsomkostninger", type: "expense", defaultVatCode: "I25" },
  // Ejendomsdrift
  { number: "3110", name: "Ejendom: El og belysning fællesarealer", type: "expense", defaultVatCode: "I25" },
  { number: "3120", name: "Ejendom: Vand og vandafledning", type: "expense", defaultVatCode: "I25" },
  { number: "3130", name: "Ejendom: Varme (fjernvarme/gas)", type: "expense", defaultVatCode: "I25" },
  { number: "3140", name: "Ejendom: Renovation og affald", type: "expense", defaultVatCode: "I25" },
  { number: "3150", name: "Ejendom: Rengøring og trappevask", type: "expense", defaultVatCode: "I25" },
  { number: "3160", name: "Ejendom: Vicevært og ejendomsservice", type: "expense", defaultVatCode: "I25" },
  { number: "3170", name: "Ejendom: Vedligeholdelse og reparationer", type: "expense", defaultVatCode: "I25" },
  { number: "3180", name: "Ejendom: Forsikringer", type: "expense", defaultVatCode: "U0" },
  { number: "3190", name: "Ejendom: Ejendomsskat", type: "expense", defaultVatCode: "U0" },
  { number: "3200", name: "Ejendom: Administration", type: "expense", defaultVatCode: "I25" },
  // Balance
  { number: "5810", name: "Bank – driftskonto", type: "balance", defaultVatCode: null },
  { number: "5820", name: "Bank – opsparing", type: "balance", defaultVatCode: null },
  { number: "6810", name: "Leverandørgæld", type: "balance", defaultVatCode: null },
  { number: "6830", name: "Skyldige udlæg til medarbejdere", type: "balance", defaultVatCode: null },
  { number: "6910", name: "Indgående moms (købsmoms)", type: "balance", defaultVatCode: null },
];

export const STANDARD_VAT: RemoteVat[] = [
  { code: "I25", name: "Indgående moms 25 %", rate: 0.25 },
  { code: "IEUV", name: "EU-varekøb (omvendt betalingspligt)", rate: 0.25 },
  { code: "IEUY", name: "EU-ydelseskøb (omvendt betalingspligt)", rate: 0.25 },
  { code: "REP", name: "Repræsentation (25 % fradrag af momsen)", rate: 0.0625 },
  { code: "U0", name: "Momsfri", rate: 0 },
];

export const STANDARD_DEPARTMENTS: RemoteDepartment[] = [
  { code: "ADM", name: "Administration" },
  { code: "SALG", name: "Salg" },
  { code: "DRIFT", name: "Drift" },
];
