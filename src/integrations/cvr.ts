import "server-only";
import { normalizeCvr } from "@/lib/banking";

export type CvrInfo = {
  cvr: string;
  name: string;
  address: string | null;
  zip: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  industry: string | null;
  status: string | null;
};

/** Fiktive demo-virksomheder, så opslag virker offline. */
const DEMO_CVR: Record<string, CvrInfo> = {};
export function registerDemoCvr(info: CvrInfo) {
  DEMO_CVR[info.cvr] = info;
}

/**
 * CVR-opslag. Bruger cvrapi.dk (gratis, begrænset antal opslag) eller Virks CVR-distribution
 * hvis CVR_API_URL er sat. Falder tilbage til demo-registret.
 */
export async function lookupCvr(input: string): Promise<CvrInfo | null> {
  const cvr = normalizeCvr(input);
  if (!cvr) return null;
  if (DEMO_CVR[cvr]) return DEMO_CVR[cvr];
  if (process.env.CVR_LOOKUP === "off") return null;
  try {
    const res = await fetch(`https://cvrapi.dk/api?search=${cvr}&country=dk`, {
      headers: { "User-Agent": process.env.CVR_USER_AGENT ?? "Fluks faktura-app - kontakt@fluks.dk" },
      signal: AbortSignal.timeout(4000),
      next: { revalidate: 60 * 60 * 24 * 7 },
    });
    if (!res.ok) return null;
    const d = (await res.json()) as {
      vat?: number;
      name?: string;
      address?: string;
      zipcode?: string;
      city?: string;
      phone?: string;
      email?: string;
      industrydesc?: string;
      error?: string;
      enddate?: string | null;
    };
    if (d.error || !d.name) return null;
    return {
      cvr,
      name: d.name,
      address: d.address ?? null,
      zip: d.zipcode ?? null,
      city: d.city ?? null,
      phone: d.phone ?? null,
      email: d.email ?? null,
      industry: d.industrydesc ?? null,
      status: d.enddate ? "Ophørt" : "Aktiv",
    };
  } catch {
    return null;
  }
}
