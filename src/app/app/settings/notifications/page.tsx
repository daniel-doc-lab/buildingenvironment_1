import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireCompany } from "@/server/auth";
import { Card, CardHeader, Badge } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "E-mails" };

export default async function OutboxPage() {
  const ctx = await requireCompany("manageIntegrations");
  const rows = await ctx.db.select().from(schema.outbox).where(eq(schema.outbox.companyId, ctx.company.id)).orderBy(desc(schema.outbox.createdAt)).limit(100);
  const live = !!process.env.RESEND_API_KEY;
  return (
    <Card>
      <CardHeader
        title="Udsendte e-mails"
        description={live ? "E-mails sendes via Resend." : "Demo: e-mails logges her i stedet for at blive sendt. Sæt RESEND_API_KEY for at sende rigtige mails."}
      />
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id}>
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-5 py-3 text-sm hover:bg-surface-2">
                <Badge tone={r.status === "sent" ? "success" : r.status === "failed" ? "danger" : "neutral"}>{r.status === "logged" ? "Logget" : r.status === "sent" ? "Sendt" : r.status}</Badge>
                <span className="min-w-0 flex-1 truncate font-medium">{r.subject}</span>
                <span className="text-xs text-muted">{r.to}</span>
                <span className="text-xs text-muted">{formatDateTime(r.createdAt)}</span>
              </summary>
              <iframe srcDoc={r.html} title={r.subject} sandbox="" className="h-80 w-full border-t border-line bg-white" />
            </details>
          </li>
        ))}
        {rows.length === 0 ? <li className="px-5 py-8 text-center text-sm text-muted">Ingen e-mails endnu</li> : null}
      </ul>
    </Card>
  );
}
