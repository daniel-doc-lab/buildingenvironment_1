/** Fiktive demo-leverandører og fakturaskabeloner. Alle navne og numre er opdigtede. */

export function makeCvr(base7: string): string {
  const w = [2, 7, 6, 5, 4, 3, 2];
  let b = base7;
  for (let attempt = 0; attempt < 20; attempt++) {
    const sum = b.split("").reduce((s, c, i) => s + Number(c) * w[i]!, 0);
    const d = (11 - (sum % 11)) % 11;
    if (d < 10) return b + d;
    b = String(Number(b) + 1).padStart(7, "0");
  }
  return b + "0";
}

/** Genererer et gyldigt 15-cifret FI-71 betalings-id (Luhn). */
export function makeFikId(seed: number) {
  const base = String(100000000000000 + ((seed * 7919) % 899999999999)).slice(0, 14);
  for (let d = 0; d <= 9; d++) {
    const candidate = base + d;
    let sum = 0;
    let dbl = false;
    for (let i = candidate.length - 1; i >= 0; i--) {
      let n = Number(candidate[i]);
      if (dbl) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      dbl = !dbl;
    }
    if (sum % 10 === 0) return candidate;
  }
  return base + "0";
}

export type DemoSupplier = {
  key: string;
  name: string;
  cvr: string;
  address: string;
  email: string;
  industry: string;
  color: [number, number, number];
  payment:
    | { kind: "fik"; type: "71" | "73" | "75"; creditor: string }
    | { kind: "bank"; reg: string; account: string }
    | { kind: "iban"; iban: string; bic: string }
    | { kind: "betalingsservice"; pbs: string };
  account: string;
  termsDays: number;
  property: boolean; // leverer til ejendomme
  monthly: boolean;
  lines: { description: string; unit?: string; qty: [number, number]; price: [number, number] }[];
  trusted?: boolean;
};

export const DEMO_COMPANY = {
  name: "Nordlys Ejendomme ApS",
  cvr: makeCvr("3871402"),
  address: "Store Kongensgade 40, 1264 København K",
};

export const DEMO_SUPPLIERS: DemoSupplier[] = [
  {
    key: "energi",
    name: "Lysgaard Energi A/S",
    cvr: makeCvr("2945117"),
    address: "Energivej 12, 7000 Fredericia",
    email: "faktura@lysgaard-energi.dk",
    industry: "Handel med elektricitet",
    color: [0.95, 0.6, 0.05],
    payment: { kind: "fik", type: "71", creditor: "85123456" },
    account: "3110",
    termsDays: 14,
    property: true,
    monthly: true,
    trusted: true,
    lines: [
      { description: "Elforbrug fællesarealer", unit: "kWh", qty: [900, 1600], price: [2.05, 2.35] },
      { description: "Abonnement og nettarif", qty: [1, 1], price: [289, 289] },
    ],
  },
  {
    key: "vand",
    name: "Vandværket Nordkysten A/S",
    cvr: makeCvr("3310552"),
    address: "Kildebakken 3, 3000 Helsingør",
    email: "kundeservice@vv-nordkysten.dk",
    industry: "Vandforsyning",
    color: [0.1, 0.45, 0.8],
    payment: { kind: "fik", type: "71", creditor: "86234567" },
    account: "3120",
    termsDays: 21,
    property: true,
    monthly: true,
    trusted: true,
    lines: [
      { description: "Vandforbrug", unit: "m3", qty: [60, 140], price: [48, 52] },
      { description: "Vandafledningsbidrag", unit: "m3", qty: [60, 140], price: [38, 41] },
    ],
  },
  {
    key: "varme",
    name: "Fjernvarme Øresund A/S",
    cvr: makeCvr("2677891"),
    address: "Varmeværksvej 8, 2300 København S",
    email: "regning@fv-oresund.dk",
    industry: "Fjernvarmeforsyning",
    color: [0.8, 0.2, 0.15],
    payment: { kind: "fik", type: "71", creditor: "87345678" },
    account: "3130",
    termsDays: 14,
    property: true,
    monthly: true,
    lines: [
      { description: "Aconto fjernvarme", qty: [1, 1], price: [6800, 9400] },
      { description: "Fast afgift målere", qty: [1, 1], price: [412, 412] },
    ],
  },
  {
    key: "rengoring",
    name: "Renholdt Rengøring ApS",
    cvr: makeCvr("4015623"),
    address: "Industrivej 22, 2600 Glostrup",
    email: "bogholderi@renholdt.dk",
    industry: "Rengøring af bygninger",
    color: [0.2, 0.6, 0.45],
    payment: { kind: "bank", reg: "3409", account: "0012456789" },
    account: "3150",
    termsDays: 14,
    property: true,
    monthly: true,
    trusted: true,
    lines: [
      { description: "Trappevask ugentlig", unit: "stk", qty: [4, 5], price: [450, 450] },
      { description: "Vinduespudsning opgange", qty: [1, 1], price: [1200, 1200] },
    ],
  },
  {
    key: "vvs",
    name: "Hansen & Søn VVS ApS",
    cvr: makeCvr("3598004"),
    address: "Håndværkervej 5, 2650 Hvidovre",
    email: "faktura@hansen-vvs.dk",
    industry: "VVS- og blikkenslagerforretninger",
    color: [0.1, 0.3, 0.55],
    payment: { kind: "bank", reg: "5301", account: "0001234567" },
    account: "3170",
    termsDays: 8,
    property: true,
    monthly: false,
    lines: [
      { description: "Udskiftning af radiatorventil", unit: "stk", qty: [1, 4], price: [685, 685] },
      { description: "Arbejdsløn VVS-montør", unit: "timer", qty: [2, 7], price: [595, 595] },
      { description: "Kørsel", qty: [1, 1], price: [295, 295] },
    ],
  },
  {
    key: "tomrer",
    name: "Tømrerfirmaet Egholm ApS",
    cvr: makeCvr("3822716"),
    address: "Savværksvej 19, 4000 Roskilde",
    email: "kontor@egholm-tomrer.dk",
    industry: "Tømrer- og bygningssnedkervirksomhed",
    color: [0.55, 0.35, 0.15],
    payment: { kind: "bank", reg: "7890", account: "0004455661" },
    account: "3170",
    termsDays: 14,
    property: true,
    monthly: false,
    lines: [
      { description: "Reparation af hoveddør og lås", qty: [1, 1], price: [3400, 5200] },
      { description: "Arbejdsløn tømrer", unit: "timer", qty: [3, 10], price: [575, 575] },
    ],
  },
  {
    key: "gartner",
    name: "Grønt Hjørne Anlægsgartner ApS",
    cvr: makeCvr("4102338"),
    address: "Planteskolevej 2, 2970 Hørsholm",
    email: "faktura@grontehjorne.dk",
    industry: "Landskabspleje",
    color: [0.25, 0.55, 0.2],
    payment: { kind: "bank", reg: "6610", account: "0007788990" },
    account: "3160",
    termsDays: 14,
    property: true,
    monthly: true,
    lines: [
      { description: "Græsslåning og havearbejde", unit: "timer", qty: [6, 12], price: [425, 425] },
      { description: "Bortkørsel af haveaffald", qty: [1, 1], price: [650, 650] },
    ],
  },
  {
    key: "forsikring",
    name: "Nordisk Ejendomsforsikring A/S",
    cvr: makeCvr("2120347"),
    address: "Forsikringsvej 1, 2100 København Ø",
    email: "erhverv@nordisk-ejf.dk",
    industry: "Skadesforsikring",
    color: [0.2, 0.2, 0.45],
    payment: { kind: "betalingsservice", pbs: "01234567" },
    account: "3180",
    termsDays: 30,
    property: true,
    monthly: false,
    lines: [{ description: "Bygningsforsikring kvartalspræmie", qty: [1, 1], price: [14800, 14800] }],
  },
  {
    key: "software",
    name: "Cloudværk ApS",
    cvr: makeCvr("4280165"),
    address: "Njalsgade 76, 2300 København S",
    email: "billing@cloudvaerk.dk",
    industry: "Udgivelse af anden software",
    color: [0.4, 0.2, 0.7],
    payment: { kind: "fik", type: "71", creditor: "88456789" },
    account: "2630",
    termsDays: 14,
    property: false,
    monthly: true,
    trusted: true,
    lines: [
      { description: "Ejendomssystem licens, månedlig", unit: "stk", qty: [1, 1], price: [1495, 1495] },
      { description: "Brugerlicenser", unit: "stk", qty: [4, 4], price: [149, 149] },
    ],
  },
  {
    key: "revisor",
    name: "Revisionsfirmaet Balance ApS",
    cvr: makeCvr("3345098"),
    address: "Revisorgade 10, 8000 Aarhus C",
    email: "faktura@balance-revision.dk",
    industry: "Revision og bogføring",
    color: [0.1, 0.4, 0.4],
    payment: { kind: "bank", reg: "9570", account: "0012003004" },
    account: "2710",
    termsDays: 14,
    property: false,
    monthly: false,
    lines: [
      { description: "Bogføringsassistance og momsafstemning", unit: "timer", qty: [4, 9], price: [950, 950] },
      { description: "Udarbejdelse af driftsregnskab", qty: [1, 1], price: [4500, 4500] },
    ],
  },
  {
    key: "affald",
    name: "Affaldsservice Sjælland I/S",
    cvr: makeCvr("2890376"),
    address: "Genbrugsvej 4, 2605 Brøndby",
    email: "faktura@affald-sj.dk",
    industry: "Indsamling af ikke-farligt affald",
    color: [0.35, 0.45, 0.2],
    payment: { kind: "fik", type: "71", creditor: "89567890" },
    account: "3140",
    termsDays: 21,
    property: true,
    monthly: true,
    lines: [
      { description: "Tømning af containere 660 L", unit: "stk", qty: [8, 12], price: [118, 118] },
      { description: "Storskraldsafhentning", qty: [1, 1], price: [540, 540] },
    ],
  },
  {
    key: "tele",
    name: "Tele Nord A/S",
    cvr: makeCvr("1901256"),
    address: "Teglholmsgade 1, 2450 København SV",
    email: "erhverv@telenord.dk",
    industry: "Telekommunikation",
    color: [0.85, 0.1, 0.45],
    payment: { kind: "betalingsservice", pbs: "02345678" },
    account: "2620",
    termsDays: 20,
    property: false,
    monthly: true,
    lines: [
      { description: "Mobilabonnement erhverv", unit: "stk", qty: [4, 4], price: [179, 179] },
      { description: "Fiberbredbånd kontor", qty: [1, 1], price: [399, 399] },
    ],
  },
];

export const NEW_SUPPLIER_EXAMPLES: DemoSupplier[] = [
  {
    key: "maler",
    name: "Malerfirmaet Farvestrålen ApS",
    cvr: makeCvr("4455120"),
    address: "Penselvej 7, 2720 Vanløse",
    email: "faktura@farvestraalen.dk",
    industry: "Malervirksomhed",
    color: [0.9, 0.35, 0.25],
    payment: { kind: "bank", reg: "2191", account: "0006677889" },
    account: "3170",
    termsDays: 8,
    property: true,
    monthly: false,
    lines: [
      { description: "Maling af opgang inkl. materialer", qty: [1, 1], price: [18500, 24500] },
      { description: "Afdækning og rengøring", unit: "timer", qty: [4, 6], price: [495, 495] },
    ],
  },
  {
    key: "laas",
    name: "Låsesmeden City ApS",
    cvr: makeCvr("4390227"),
    address: "Nøglegade 3, 1150 København K",
    email: "info@laasesmedencity.dk",
    industry: "Låsesmede",
    color: [0.3, 0.3, 0.3],
    payment: { kind: "fik", type: "71", creditor: "81234987" },
    account: "3170",
    termsDays: 8,
    property: true,
    monthly: false,
    lines: [
      { description: "Udskiftning af cylinderlås, systemnøgle", unit: "stk", qty: [1, 3], price: [1150, 1150] },
      { description: "Udkørsel", qty: [1, 1], price: [395, 395] },
    ],
  },
  {
    key: "kontor",
    name: "Kontorland Danmark A/S",
    cvr: makeCvr("2561489"),
    address: "Papirvej 9, 5220 Odense SØ",
    email: "ordre@kontorland.dk",
    industry: "Engroshandel med kontorartikler",
    color: [0.05, 0.5, 0.6],
    payment: { kind: "fik", type: "71", creditor: "82345098" },
    account: "2610",
    termsDays: 30,
    property: false,
    monthly: false,
    lines: [
      { description: "Kopipapir A4 80g, kasse", unit: "stk", qty: [2, 6], price: [229, 229] },
      { description: "Toner sort", unit: "stk", qty: [1, 3], price: [689, 689] },
    ],
  },
];

export const DEMO_USERS = [
  { key: "owner", email: "demo@fluks.dk", name: "Sofie Andersen", role: "owner" as const, title: "Direktør", bankReg: "3409", bankAccount: "0011223344" },
  { key: "accountant", email: "bogholder@fluks.dk", name: "Mikkel Jensen", role: "accountant" as const, title: "Bogholder", bankReg: "2191", bankAccount: "0022334455" },
  { key: "approver", email: "driftschef@fluks.dk", name: "Anna Larsen", role: "approver" as const, title: "Driftschef", bankReg: "5301", bankAccount: "0033445566" },
  { key: "member", email: "vicevaert@fluks.dk", name: "Jonas Nielsen", role: "member" as const, title: "Vicevært", bankReg: "7890", bankAccount: "0044556677" },
  { key: "auditor", email: "revisor@fluks.dk", name: "Birgitte Holm", role: "auditor" as const, title: "Ekstern revisor", bankReg: null, bankAccount: null },
];

export const DEMO_PASSWORD = "demo1234";
