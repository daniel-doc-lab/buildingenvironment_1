import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireCompany } from "@/server/auth";
import { Card, CardHeader } from "@/components/ui";
import { AUDIT_LABEL } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Revisionslog" };

export default async function AuditPage() {
  const ctx = await requireCompany();
  const rows = await ctx.db
    .select({ log: schema.auditLog, name: schema.users.name })
    .from(schema.auditLog)
    .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.userId))
    .where(eq(schema.auditLog.companyId, ctx.company.id))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(300);
  const TYPE: Record<string, string> = { invoice: "Faktura", payment_batch: "Betalingsbatch", payment: "Betaling", supplier: "Leverandør", workflow: "Godkendelsesflow", integration: "Integration", bank_connection: "Bank", user: "Bruger", company: "Virksomhed", invitation: "Invitation", delegation: "Stedfortræder" };
  return (
    <Card>
      <CardHeader title="Revisionslog" description="Uforanderligt spor over alle handlinger – opfylder bogføringslovens krav om dokumentation. Opbevares i 5 år." />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-5 py-2 font-medium">Tidspunkt</th>
              <th className="px-4 py-2 font-medium">Bruger</th>
              <th className="px-4 py-2 font-medium">Handling</th>
              <th className="px-5 py-2 font-medium">Detaljer</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ log, name }) => (
              <tr key={log.id} className="border-b border-line last:border-0">
                <td className="whitespace-nowrap px-5 py-2 text-muted">{formatDateTime(log.createdAt)}</td>
                <td className="px-4 py-2">{name ?? "Fluks (automatisk)"}</td>
                <td className="px-4 py-2">
                  {TYPE[log.entityType] ?? log.entityType}: {AUDIT_LABEL[log.action] ?? log.action}{" "}
                  {log.entityType === "invoice" && log.entityId ? (
                    <Link href={`/app/invoices/${log.entityId}`} className="text-brand hover:underline">
                      åbn
                    </Link>
                  ) : null}
                </td>
                <td className="max-w-[320px] truncate px-5 py-2 font-mono text-xs text-muted">{log.data ? JSON.stringify(log.data) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
