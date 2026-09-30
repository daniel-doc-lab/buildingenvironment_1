import "server-only";
import type { PropertyProvider, RemoteProperty } from "./types";

/**
 * Boligflow-adapter. Boligflow udleverer API-adgang til partnere (tilkøb hos Boligflow).
 * Endepunkterne kan tilpasses via BOLIGFLOW_API_URL og feltmapningen nedenfor, når API-dokumentationen er modtaget.
 * Indtil da kan ejendomme importeres fra en CSV-eksport fra Boligflow (se importCsv).
 */
export class BoligflowProvider implements PropertyProvider {
  readonly id = "boligflow" as const;
  readonly label = "Boligflow";
  private base: string;

  constructor(
    private apiKey: string,
    baseUrl?: string,
  ) {
    this.base = baseUrl ?? process.env.BOLIGFLOW_API_URL ?? "https://api.boligflow.dk/v1";
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(this.base + path, {
      headers: { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Boligflow ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json() as Promise<T>;
  }

  async fetchProperties(): Promise<RemoteProperty[]> {
    type P = { id: string | number; name?: string; address?: string; street?: string; zip?: string; zipCode?: string; city?: string };
    type U = { id: string | number; name?: string; number?: string; tenant?: { name?: string } | null; tenantName?: string; area?: number };
    const props = await this.get<P[] | { data: P[] }>("/properties");
    const list = Array.isArray(props) ? props : props.data;
    const out: RemoteProperty[] = [];
    for (const p of list) {
      const units = await this.get<U[] | { data: U[] }>(`/properties/${p.id}/leases`).catch(() => [] as U[]);
      const ul = Array.isArray(units) ? units : units.data;
      out.push({
        externalId: String(p.id),
        name: p.name ?? p.address ?? p.street ?? `Ejendom ${p.id}`,
        address: p.address ?? p.street ?? null,
        zip: p.zip ?? p.zipCode ?? null,
        city: p.city ?? null,
        units: ul.map((u) => ({
          externalId: String(u.id),
          name: u.name ?? u.number ?? String(u.id),
          tenantName: u.tenant?.name ?? u.tenantName ?? null,
          areaM2: u.area ?? null,
        })),
      });
    }
    return out;
  }

  async pushExpense(e: { propertyExternalId: string; unitExternalId: string | null; amount: number; date: string; text: string; voucher: string | null }) {
    const res = await fetch(`${this.base}/properties/${e.propertyExternalId}/expenses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ leaseId: e.unitExternalId, amount: e.amount / 100, date: e.date, text: e.text, voucher: e.voucher }),
    });
    if (!res.ok) throw new Error(`Boligflow ${res.status}`);
  }
}

/** Import af ejendomme fra CSV (kolonner: ejendom;adresse;postnr;by;lejemål;lejer;areal). */
export function importPropertyCsv(csv: string): RemoteProperty[] {
  const rows = csv
    .split(/\r?\n/)
    .map((l) => l.split(/[;\t]/).map((c) => c.trim().replace(/^"|"$/g, "")))
    .filter((r) => r.length >= 2 && r[0]);
  const header = rows[0]?.map((h) => h.toLowerCase()) ?? [];
  const hasHeader = header.some((h) => /ejendom|adresse|navn/.test(h));
  const data = hasHeader ? rows.slice(1) : rows;
  const map = new Map<string, RemoteProperty>();
  for (const r of data) {
    const [name, address, zip, city, unit, tenant, area] = r;
    const key = name!;
    const p = map.get(key) ?? {
      externalId: `CSV-${key.replace(/\W+/g, "-").slice(0, 30)}`,
      name: key,
      address: address ? `${address}${zip ? `, ${zip} ${city ?? ""}` : ""}`.trim() : null,
      zip: zip ?? null,
      city: city ?? null,
      units: [],
    };
    if (unit) p.units.push({ externalId: `${p.externalId}-${p.units.length + 1}`, name: unit, tenantName: tenant || null, areaM2: area ? Number(area.replace(",", ".")) : null });
    map.set(key, p);
  }
  return [...map.values()];
}
