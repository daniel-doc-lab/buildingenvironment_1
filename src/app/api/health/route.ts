import { NextResponse } from "next/server";
import { count, eq } from "drizzle-orm";
import { dbStatus, getDb, schema } from "@/db";

export const dynamic = "force-dynamic";

/** Driftsstatus: om databasen er klar, og om demovirksomheden er oprettet. Ingen hemmeligheder. */
export async function GET() {
  const started = Date.now();
  try {
    const db = await getDb();
    const demo = await db.query.companies.findFirst({
      where: eq(schema.companies.isDemo, true),
      columns: { id: true, settings: true },
    });
    const [users] = await db.select({ n: count() }).from(schema.users);
    const [invoices] = demo
      ? await db.select({ n: count() }).from(schema.invoices).where(eq(schema.invoices.companyId, demo.id))
      : [{ n: 0 }];
    return NextResponse.json({
      ok: true,
      db: dbStatus().kind,
      demo: demo ? { ready: !!demo.settings.seedComplete, invoices: invoices?.n ?? 0 } : null,
      users: users?.n ?? 0,
      ms: Date.now() - started,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, db: dbStatus().kind, error: e instanceof Error ? e.message : String(e), ms: Date.now() - started },
      { status: 503 },
    );
  }
}
