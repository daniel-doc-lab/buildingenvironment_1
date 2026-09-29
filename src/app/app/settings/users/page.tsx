import type { Metadata } from "next";
import { and, eq, isNull, gte } from "drizzle-orm";
import { schema } from "@/db";
import { requireCompany, can } from "@/server/auth";
import { Card, CardHeader, Field, Input, Select, Avatar, Badge } from "@/components/ui";
import { FormCard } from "../form-card";
import { inviteUserAction, addDelegationAction } from "../actions";
import { MemberRow, DelegationRow } from "./member-row";
import { ROLE_LABELS_CLIENT, ROLE_DESCRIPTIONS } from "@/lib/roles";
import { ROLES } from "@/db/schema";
import { formatDate, todayISO } from "@/lib/utils";

export const metadata: Metadata = { title: "Brugere" };

export default async function UsersPage() {
  const ctx = await requireCompany();
  const [members, invites, delegations] = await Promise.all([
    ctx.db
      .select({ m: schema.memberships, u: schema.users })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(eq(schema.memberships.companyId, ctx.company.id))
      .orderBy(schema.users.name),
    ctx.db.select().from(schema.invitations).where(and(eq(schema.invitations.companyId, ctx.company.id), isNull(schema.invitations.acceptedAt))),
    ctx.db.select().from(schema.delegations).where(and(eq(schema.delegations.companyId, ctx.company.id), gte(schema.delegations.toDate, todayISO()))),
  ]);
  const manage = can(ctx.role, "manageUsers");
  const name = (id: string) => members.find((m) => m.u.id === id)?.u.name ?? "–";
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Brugere" description={`${members.length} personer har adgang`} />
        <ul className="divide-y divide-line">
          {members.map(({ m, u }) => (
            <MemberRow key={u.id} user={{ id: u.id, name: u.name, email: u.email, title: m.title }} role={m.role} canManage={manage && u.id !== ctx.user.id} isMe={u.id === ctx.user.id} />
          ))}
          {invites.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-5 py-3 text-sm">
              <Avatar name={i.email} />
              <span className="min-w-0 flex-1 truncate text-muted">{i.email}</span>
              <Badge tone="warning">Inviteret · {ROLE_LABELS_CLIENT[i.role]}</Badge>
            </li>
          ))}
        </ul>
      </Card>
      {manage ? (
        <FormCard title="Invitér kollega" description="De modtager en mail med et link til at oprette sig." action={inviteUserAction} submitLabel="Send invitation" resetOnSuccess>
          <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
            <Field label="E-mail">
              <Input name="email" type="email" required placeholder="kollega@firma.dk" />
            </Field>
            <Field label="Rolle">
              <Select name="role" defaultValue="approver">
                {ROLES.filter((r) => r !== "owner").map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS_CLIENT[r]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <ul className="grid gap-1 text-xs text-muted sm:grid-cols-2">
            {ROLES.map((r) => (
              <li key={r}>
                <span className="font-medium text-ink-2">{ROLE_LABELS_CLIENT[r]}:</span> {ROLE_DESCRIPTIONS[r]}
              </li>
            ))}
          </ul>
        </FormCard>
      ) : null}
      <Card>
        <CardHeader title="Stedfortrædere" description="Når en godkender er på ferie, går nye godkendelser automatisk til stedfortræderen." />
        {delegations.length ? (
          <ul className="divide-y divide-line">
            {delegations.map((d) => (
              <DelegationRow key={d.id} id={d.id} text={`${name(d.userId)} → ${name(d.delegateId)} · ${formatDate(d.fromDate)} – ${formatDate(d.toDate)}`} canRemove={manage || d.userId === ctx.user.id} />
            ))}
          </ul>
        ) : (
          <p className="px-5 py-4 text-sm text-muted">Ingen aktive stedfortrædere.</p>
        )}
      </Card>
      <FormCard title="Opret stedfortræder" action={addDelegationAction} submitLabel="Opret" resetOnSuccess disabled={!can(ctx.role, "approve")}>
        <div className="grid gap-4 sm:grid-cols-2">
          {manage ? (
            <Field label="Godkender">
              <Select name="userId" defaultValue={ctx.user.id}>
                {members.map(({ u }) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Stedfortræder">
            <Select name="delegateId" required defaultValue="">
              <option value="" disabled>
                Vælg…
              </option>
              {members.map(({ u }) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fra">
            <Input type="date" name="fromDate" required defaultValue={todayISO()} />
          </Field>
          <Field label="Til">
            <Input type="date" name="toDate" required />
          </Field>
        </div>
      </FormCard>
    </div>
  );
}
