import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { ingestDocument } from "@/server/services/ingest";
import { isUbl } from "@/integrations/einvoice/ubl";
import { decrypt } from "@/lib/crypto";

/**
 * Modtager OIOUBL/Peppol BIS-dokumenter fra access point-udbyderen (fx via webhook).
 * Kræver header X-Fluks-Secret med den hemmelighed, der blev oprettet ved aktivering.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("company");
  const db = await getDb();
  const company = slug ? await db.query.companies.findFirst({ where: eq(schema.companies.slug, slug) }) : null;
  if (!company) return NextResponse.json({ error: "Ukendt virksomhed" }, { status: 404 });
  const integ = await db.query.integrations.findFirst({
    where: and(eq(schema.integrations.companyId, company.id), eq(schema.integrations.provider, "nemhandel")),
  });
  if (!integ) return NextResponse.json({ error: "NemHandel er ikke aktiveret" }, { status: 403 });
  const expected = integ.config.webhookSecret ? decrypt(integ.config.webhookSecret) : null;
  if (expected && req.headers.get("x-fluks-secret") !== expected) return new NextResponse("Unauthorized", { status: 401 });
  const xml = await req.text();
  if (!isUbl(xml)) return NextResponse.json({ error: "Ikke et UBL-dokument" }, { status: 400 });
  const id = await ingestDocument(db, {
    companyId: company.id,
    userId: null,
    file: { name: `NemHandel-${Date.now()}.xml`, mime: "application/xml", data: Buffer.from(xml, "utf8") },
    source: "nemhandel",
  });
  return NextResponse.json({ ok: true, invoiceId: id });
}
