import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireCompany, can } from "@/server/auth";
import { WorkflowEditor } from "./workflow-editor";

export const metadata: Metadata = { title: "Godkendelsesflows" };

export default async function WorkflowsPage() {
  const ctx = await requireCompany();
  const [workflows, members, properties, suppliers] = await Promise.all([
    ctx.db.select().from(schema.approvalWorkflows).where(eq(schema.approvalWorkflows.companyId, ctx.company.id)).orderBy(asc(schema.approvalWorkflows.priority)),
    ctx.db
      .select({ id: schema.users.id, name: schema.users.name, role: schema.memberships.role })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(eq(schema.memberships.companyId, ctx.company.id)),
    ctx.db.select({ id: schema.properties.id, name: schema.properties.name }).from(schema.properties).where(eq(schema.properties.companyId, ctx.company.id)),
    ctx.db.select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers).where(eq(schema.suppliers.companyId, ctx.company.id)).orderBy(schema.suppliers.name),
  ]);
  return (
    <WorkflowEditor
      canEdit={can(ctx.role, "manageWorkflows")}
      workflows={workflows.map((w) => ({ id: w.id, name: w.name, priority: w.priority, active: w.active, conditions: w.conditions, steps: w.steps }))}
      members={members}
      properties={properties}
      suppliers={suppliers}
    />
  );
}
