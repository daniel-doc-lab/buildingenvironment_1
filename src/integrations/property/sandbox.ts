import type { PropertyProvider, RemoteProperty } from "./types";

export const SANDBOX_PROPERTIES: RemoteProperty[] = [
  {
    externalId: "BF-1001",
    name: "Fælledvej Gården",
    address: "Fælledvej 18, 2200 København N",
    zip: "2200",
    city: "København N",
    units: [
      { externalId: "BF-1001-01", name: "st. tv.", tenantName: "Mette Holm", areaM2: 68 },
      { externalId: "BF-1001-02", name: "st. th.", tenantName: "Jonas Friis", areaM2: 72 },
      { externalId: "BF-1001-03", name: "1. tv.", tenantName: "Sara & Ali Nazari", areaM2: 94 },
      { externalId: "BF-1001-04", name: "1. th.", tenantName: null, areaM2: 94 },
      { externalId: "BF-1001-05", name: "2. tv.", tenantName: "Peter Lund", areaM2: 94 },
    ],
  },
  {
    externalId: "BF-1002",
    name: "Havnehuset Aarhus",
    address: "Bernhardt Jensens Boulevard 41, 8000 Aarhus C",
    zip: "8000",
    city: "Aarhus C",
    units: [
      { externalId: "BF-1002-01", name: "Erhverv stuen", tenantName: "Kaffebaren ApS", areaM2: 140 },
      { externalId: "BF-1002-02", name: "Lejl. 1.1", tenantName: "Line Kjær", areaM2: 81 },
      { externalId: "BF-1002-03", name: "Lejl. 1.2", tenantName: "Mads Bech", areaM2: 77 },
      { externalId: "BF-1002-04", name: "Lejl. 2.1", tenantName: "Camilla Dahl", areaM2: 102 },
    ],
  },
  {
    externalId: "BF-1003",
    name: "Kongensgade Erhverv",
    address: "Kongensgade 66, 5000 Odense C",
    zip: "5000",
    city: "Odense C",
    units: [
      { externalId: "BF-1003-01", name: "Butik", tenantName: "Odense Blomster", areaM2: 110 },
      { externalId: "BF-1003-02", name: "Kontor 1. sal", tenantName: "Revisorhuset Fyn", areaM2: 220 },
    ],
  },
];

export class SandboxProperty implements PropertyProvider {
  readonly id = "sandbox" as const;
  readonly label = "Sandbox (Boligflow-demo)";
  async fetchProperties() {
    return SANDBOX_PROPERTIES;
  }
  async pushExpense() {}
}
