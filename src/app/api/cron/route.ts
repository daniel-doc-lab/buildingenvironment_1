import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { processDuePayments } from "@/server/services/payments";
import { sendReminders } from "@/server/services/approvals";
import { syncBank } from "@/server/services/bank";

/**
 * Planlagte job (kør fx hvert 15. minut via Vercel Cron eller en anden scheduler):
 * gennemfør/poll betalinger, synkronisér banker og send påmindelser.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("Unauthorized", { status: 401 });
  const db = await getDb();
  const executed = await processDuePayments(db);
  const reminders = await sendReminders(db);
  const conns = await db.select({ companyId: schema.bankConnections.companyId }).from(schema.bankConnections).where(eq(schema.bankConnections.status, "active"));
  let synced = 0;
  for (const c of new Set(conns.map((x) => x.companyId))) {
    await syncBank(db, c).catch(() => undefined);
    synced++;
  }
  return NextResponse.json({ ok: true, executed, reminders, synced });
}
