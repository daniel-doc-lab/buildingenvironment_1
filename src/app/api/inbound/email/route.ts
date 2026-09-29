import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { getDb, schema } from "@/db";
import { ingestDocument } from "@/server/services/ingest";
import { ACCEPTED_MIME, guessMime } from "@/server/services/files";

/**
 * Indgående e-mail (Postmark inbound JSON; Mailgun/SendGrid kan mappes tilsvarende).
 * Adressen <slug>@indbakke.fluks.dk afgør virksomheden. Beskyttet med INBOUND_EMAIL_SECRET (?secret=… eller Basic Auth).
 */
export async function POST(req: Request) {
  const secret = process.env.INBOUND_EMAIL_SECRET;
  const url = new URL(req.url);
  const auth = req.headers.get("authorization") ?? "";
  const basic = auth.startsWith("Basic ") ? Buffer.from(auth.slice(6), "base64").toString().split(":")[1] : null;
  if (secret && url.searchParams.get("secret") !== secret && basic !== secret) return new NextResponse("Unauthorized", { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    To?: string;
    OriginalRecipient?: string;
    From?: string;
    Subject?: string;
    MessageID?: string;
    Attachments?: { Name: string; Content: string; ContentType: string }[];
  } | null;
  if (!body) return NextResponse.json({ error: "Ugyldigt format" }, { status: 400 });
  const to = `${body.OriginalRecipient ?? ""} ${body.To ?? ""}`.toLowerCase();
  const slug = to.match(/([a-z0-9-]+)@indbakke\./)?.[1];
  if (!slug) return NextResponse.json({ error: "Ukendt modtager" }, { status: 404 });
  const db = await getDb();
  const company = await db.query.companies.findFirst({ where: eq(schema.companies.slug, slug) });
  if (!company) return NextResponse.json({ error: "Ukendt virksomhed" }, { status: 404 });

  const files = (body.Attachments ?? []).filter((a) => ACCEPTED_MIME.includes(guessMime(a.Name, a.ContentType)));
  if (!files.length) return NextResponse.json({ ok: true, ingested: 0, note: "Ingen fakturafiler i mailen" });
  // Svar hurtigt – læs dokumenterne efter svaret er sendt
  after(async () => {
    for (const a of files) {
      await ingestDocument(db, {
        companyId: company.id,
        userId: null,
        file: { name: a.Name, mime: guessMime(a.Name, a.ContentType), data: Buffer.from(a.Content, "base64") },
        source: "email",
        sourceRef: `${body.From ?? ""} · ${body.Subject ?? ""}`.slice(0, 300),
      }).catch((e) => console.error("Indlæsning fejlede", e));
    }
  });
  return NextResponse.json({ ok: true, ingested: files.length });
}
