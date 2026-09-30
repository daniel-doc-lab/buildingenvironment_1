import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireCompany, can } from "@/server/auth";
import { Card, CardHeader, Field, Input, Select, Badge } from "@/components/ui";
import { FormCard } from "../form-card";
import { saveRuleAction } from "../actions";
import { RuleToggle } from "./rule-toggle";
import { Sparkles } from "lucide-react";

export const metadata: Metadata = { title: "Konteringsregler" };

export default async function RulesPage() {
  const ctx = await requireCompany();
  const [rules, suppliers, accounts, vats, props] = await Promise.all([
    ctx.db
      .select({ r: schema.codingRules, supplier: schema.suppliers.name })
      .from(schema.codingRules)
      .leftJoin(schema.suppliers, eq(schema.suppliers.id, schema.codingRules.supplierId))
      .where(eq(schema.codingRules.companyId, ctx.company.id))
      .orderBy(desc(schema.codingRules.hits)),
    ctx.db.select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers).where(eq(schema.suppliers.companyId, ctx.company.id)).orderBy(schema.suppliers.name),
    ctx.db.select().from(schema.accounts).where(eq(schema.accounts.companyId, ctx.company.id)).orderBy(schema.accounts.number),
    ctx.db.select().from(schema.vatCodes).where(eq(schema.vatCodes.companyId, ctx.company.id)),
    ctx.db.select({ id: schema.properties.id, name: schema.properties.name }).from(schema.properties).where(eq(schema.properties.companyId, ctx.company.id)),
  ]);
  const edit = can(ctx.role, "manageWorkflows");
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Konteringsregler"
          description="Regler har forrang for AI. Fluks lærer også selv regler, når samme leverandør konteres ens flere gange."
        />
        <ul className="divide-y divide-line">
          {rules.map(({ r, supplier }) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium">
                  {r.name}
                  {r.source === "learned" ? (
                    <Badge tone="brand">
                      <Sparkles className="h-3 w-3" /> Lært af AI
                    </Badge>
                  ) : null}
                </p>
                <p className="text-xs text-muted">
                  {supplier ? `Leverandør: ${supplier}` : "Alle leverandører"}
                  {r.matchText ? ` · tekst indeholder "${r.matchText}"` : ""} → konto {r.accountNumber}
                  {r.vatCode ? ` · ${r.vatCode}` : ""} · brugt {r.hits} gange
                </p>
              </div>
              {edit ? <RuleToggle id={r.id} active={r.active} /> : <Badge>{r.active ? "Aktiv" : "Inaktiv"}</Badge>}
            </li>
          ))}
          {rules.length === 0 ? <li className="px-5 py-8 text-center text-sm text-muted">Ingen regler endnu</li> : null}
        </ul>
      </Card>
      {edit ? (
        <FormCard title="Ny regel" action={saveRuleAction} submitLabel="Opret regel" resetOnSuccess>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Leverandør">
              <Select name="supplierId" defaultValue="">
                <option value="">Alle leverandører</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Når linjeteksten indeholder" hint="Valgfrit, fx 'vinduespudsning'">
              <Input name="matchText" />
            </Field>
            <Field label="Kontér på konto">
              <Select name="accountNumber" required defaultValue="">
                <option value="" disabled>
                  Vælg konto…
                </option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.number}>
                    {a.number} {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Momskode">
              <Select name="vatCode" defaultValue="">
                <option value="">Kontoens standard</option>
                {vats.map((v) => (
                  <option key={v.id} value={v.code}>
                    {v.code} – {v.name}
                  </option>
                ))}
              </Select>
            </Field>
            {props.length ? (
              <Field label="Ejendom">
                <Select name="propertyId" defaultValue="">
                  <option value="">Ingen</option>
                  {props.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Navn (valgfrit)">
              <Input name="name" />
            </Field>
          </div>
        </FormCard>
      ) : null}
    </div>
  );
}
