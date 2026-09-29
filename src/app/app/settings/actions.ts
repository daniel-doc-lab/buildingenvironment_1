"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/db";
import type { Role, WorkflowConditions, WorkflowStep } from "@/db/schema";
import { ROLES } from "@/db/schema";
import { actionContext } from "@/server/auth";
import { audit } from "@/server/audit";
import { encrypt, randomToken } from "@/lib/crypto";
import { normalizeAccount, normalizeReg } from "@/lib/banking";
import { parseAmount } from "@/lib/utils";
import { syncMasterData, syncProperties } from "@/server/services/accounting";
import { sendEmail, emailLayout } from "@/integrations/email";
import type { ActionResult } from "../actions";

const ok = <T,>(data?: T, message?: string): ActionResult<T> => {
  revalidatePath("/app", "layout");
  return { ok: true, data, message };
};
const fail = (e: unknown): ActionResult<never> => ({ ok: false, error: (e as Error).message });

// ---------------------------------------------------------------------------
// Virksomhed
// ---------------------------------------------------------------------------

export async function saveCompanyAction(form: FormData): Promise<ActionResult> {
  try {
    const ctx = await actionContext("manageCompany");
    const s = (k: string) => String(form.get(k) ?? "").trim();
    await ctx.db
      .update(schema.companies)
      .set({
        name: s("name") || ctx.company.name,
        cvr: s("cvr").replace(/\D/g, "") || null,
        address: s("address") || null,
        settings: {
          ...ctx.company.settings,
          paymentLeadDays: Math.max(0, Math.min(10, Number(s("paymentLeadDays") || 1))),
          fourEyesThreshold: parseAmount(s("fourEyesThreshold")) ?? undefined,
          autoApproveBelow: parseAmount(s("autoApproveBelow")) ?? 0,
          reminderHours: Number(s("reminderHours") || 24),
          propertyModule: form.get("propertyModule") === "on",
          defaultPaymentAccountId: s("defaultPaymentAccountId") || ctx.company.settings.defaultPaymentAccountId,
        },
      })
      .where(eq(schema.companies.id, ctx.company.id));
    await audit(ctx.db, ctx.company.id, ctx.user.id, "company", ctx.company.id, "edited");
    return ok(undefined, "Indstillinger gemt");
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Brugere
// ---------------------------------------------------------------------------

export async function inviteUserAction(form: FormData): Promise<ActionResult<{ link: string }>> {
  try {
    const ctx = await actionContext("manageUsers");
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const role = String(form.get("role") ?? "approver") as Role;
    if (!z.email().safeParse(email).success) throw new Error("Ugyldig e-mail");
    if (!ROLES.includes(role)) throw new Error("Ugyldig rolle");
    const existing = await ctx.db.query.users.findFirst({ where: eq(schema.users.email, email) });
    const base = process.env.APP_URL ?? "";
    if (existing) {
      await ctx.db.insert(schema.memberships).values({ userId: existing.id, companyId: ctx.company.id, role }).onConflictDoUpdate({
        target: [schema.memberships.userId, schema.memberships.companyId],
        set: { role },
      });
      await sendEmail(ctx.db, {
        companyId: ctx.company.id,
        to: email,
        subject: `Du har fået adgang til ${ctx.company.name} i Fluks`,
        html: emailLayout(`Velkommen til ${ctx.company.name}`, `${ctx.user.name} har givet dig adgang.`, { href: `${base}/login`, label: "Log ind" }),
      });
      await audit(ctx.db, ctx.company.id, ctx.user.id, "user", existing.id, "added", { role });
      return ok({ link: `${base}/login` }, `${email} har fået adgang`);
    }
    const token = randomToken(18);
    await ctx.db.insert(schema.invitations).values({ companyId: ctx.company.id, email, role, token, invitedBy: ctx.user.id });
    const link = `${base}/signup?invite=${token}`;
    await sendEmail(ctx.db, {
      companyId: ctx.company.id,
      to: email,
      subject: `${ctx.user.name} inviterer dig til Fluks`,
      html: emailLayout(`Du er inviteret til ${ctx.company.name}`, `${ctx.user.name} har inviteret dig til at hjælpe med fakturaer og godkendelser i Fluks.`, {
        href: link || `/signup?invite=${token}`,
        label: "Acceptér invitation",
      }),
    });
    await audit(ctx.db, ctx.company.id, ctx.user.id, "invitation", null, "created", { email, role });
    return ok({ link: `/signup?invite=${token}` }, `Invitation sendt til ${email}`);
  } catch (e) {
    return fail(e);
  }
}

export async function changeRoleAction(userId: string, role: Role): Promise<ActionResult> {
  try {
    const ctx = await actionContext("manageUsers");
    if (!ROLES.includes(role)) throw new Error("Ugyldig rolle");
    if (userId === ctx.user.id && role !== ctx.role) throw new Error("Du kan ikke ændre din egen rolle");
    await ctx.db
      .update(schema.memberships)
      .set({ role })
      .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.companyId, ctx.company.id)));
    await audit(ctx.db, ctx.company.id, ctx.user.id, "user", userId, "role_changed", { role });
    return ok(undefined, "Rolle ændret");
  } catch (e) {
    return fail(e);
  }
}

export async function removeMemberAction(userId: string): Promise<ActionResult> {
  try {
    const ctx = await actionContext("manageUsers");
    if (userId === ctx.user.id) throw new Error("Du kan ikke fjerne dig selv");
    await ctx.db.delete(schema.memberships).where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.companyId, ctx.company.id)));
    await audit(ctx.db, ctx.company.id, ctx.user.id, "user", userId, "removed");
    return ok(undefined, "Bruger fjernet");
  } catch (e) {
    return fail(e);
  }
}

export async function addDelegationAction(form: FormData): Promise<ActionResult> {
  try {
    const ctx = await actionContext("approve");
    const delegateId = String(form.get("delegateId") ?? "");
    const fromDate = String(form.get("fromDate") ?? "");
    const toDate = String(form.get("toDate") ?? "");
    const userId = String(form.get("userId") || ctx.user.id);
    if (userId !== ctx.user.id && !["owner", "admin"].includes(ctx.role)) throw new Error("Du kan kun oprette stedfortræder for dig selv");
    if (!delegateId || !fromDate || !toDate || toDate < fromDate) throw new Error("Udfyld stedfortræder og periode");
    if (delegateId === userId) throw new Error("Vælg en anden person");
    await ctx.db.insert(schema.delegations).values({ companyId: ctx.company.id, userId, delegateId, fromDate, toDate });
    await audit(ctx.db, ctx.company.id, ctx.user.id, "delegation", null, "created", { delegateId, fromDate, toDate });
    return ok(undefined, "Stedfortræder oprettet");
  } catch (e) {
    return fail(e);
  }
}

export async function removeDelegationAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await actionContext("approve");
    await ctx.db.delete(schema.delegations).where(and(eq(schema.delegations.id, id), eq(schema.delegations.companyId, ctx.company.id)));
    return ok();
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------------

export async function saveProfileAction(form: FormData): Promise<ActionResult> {
  try {
    const ctx = await actionContext("view");
    const name = String(form.get("name") ?? "").trim();
    const reg = normalizeReg(String(form.get("bankReg") ?? ""));
    const acc = normalizeAccount(String(form.get("bankAccount") ?? ""));
    if ((form.get("bankReg") || form.get("bankAccount")) && (!reg || !acc)) throw new Error("Reg.nr. skal være 4 cifre og kontonr. 6-10 cifre");
    await ctx.db
      .update(schema.users)
      .set({ name: name || ctx.user.name, phone: String(form.get("phone") ?? "") || null, bankReg: reg, bankAccount: acc })
      .where(eq(schema.users.id, ctx.user.id));
    const pw = String(form.get("password") ?? "");
    if (pw) {
      if (pw.length < 8) throw new Error("Adgangskoden skal være mindst 8 tegn");
      const current = String(form.get("currentPassword") ?? "");
      if (!(await bcrypt.compare(current, ctx.user.passwordHash))) throw new Error("Nuværende adgangskode er forkert");
      await ctx.db.update(schema.users).set({ passwordHash: await bcrypt.hash(pw, 10) }).where(eq(schema.users.id, ctx.user.id));
    }
    return ok(undefined, "Profil gemt");
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Godkendelsesflows
// ---------------------------------------------------------------------------

const WorkflowInput = z.object({
  id: z.string().nullable(),
  name: z.string().min(2),
  priority: z.coerce.number().int(),
  active: z.boolean(),
  conditions: z.object({
    minAmount: z.string().nullable().optional(),
    maxAmount: z.string().nullable().optional(),
    supplierIds: z.array(z.string()).optional(),
    propertyIds: z.array(z.string()).optional(),
    newSupplierOnly: z.boolean().optional(),
    kinds: z.array(z.string()).optional(),
  }),
  steps: z
    .array(z.object({ name: z.string().min(1), approverIds: z.array(z.string()), role: z.string().nullable().optional(), mode: z.enum(["any", "all"]) }))
    .min(1, "Tilføj mindst ét godkendelsestrin"),
});

export async function saveWorkflowAction(input: z.input<typeof WorkflowInput>): Promise<ActionResult> {
  try {
    const ctx = await actionContext("manageWorkflows");
    const w = WorkflowInput.parse(input);
    for (const s of w.steps) if (!s.approverIds.length && !s.role) throw new Error(`Trinnet "${s.name}" mangler godkendere`);
    const conditions: WorkflowConditions = {
      minAmount: w.conditions.minAmount ? parseAmount(w.conditions.minAmount) : null,
      maxAmount: w.conditions.maxAmount ? parseAmount(w.conditions.maxAmount) : null,
      supplierIds: w.conditions.supplierIds?.length ? w.conditions.supplierIds : undefined,
      propertyIds: w.conditions.propertyIds?.length ? w.conditions.propertyIds : undefined,
      newSupplierOnly: w.conditions.newSupplierOnly || undefined,
      kinds: w.conditions.kinds?.length ? w.conditions.kinds : undefined,
    };
    const steps: WorkflowStep[] = w.steps.map((s) => ({ name: s.name, approverIds: s.approverIds, role: s.role || null, mode: s.mode }));
    if (w.id) {
      await ctx.db
        .update(schema.approvalWorkflows)
        .set({ name: w.name, priority: w.priority, active: w.active, conditions, steps })
        .where(and(eq(schema.approvalWorkflows.id, w.id), eq(schema.approvalWorkflows.companyId, ctx.company.id)));
    } else {
      await ctx.db.insert(schema.approvalWorkflows).values({ companyId: ctx.company.id, name: w.name, priority: w.priority, active: w.active, conditions, steps });
    }
    await audit(ctx.db, ctx.company.id, ctx.user.id, "workflow", w.id, w.id ? "edited" : "created", { name: w.name });
    return ok(undefined, "Godkendelsesflow gemt");
  } catch (e) {
    return fail(e);
  }
}

export async function deleteWorkflowAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await actionContext("manageWorkflows");
    await ctx.db.delete(schema.approvalWorkflows).where(and(eq(schema.approvalWorkflows.id, id), eq(schema.approvalWorkflows.companyId, ctx.company.id)));
    await audit(ctx.db, ctx.company.id, ctx.user.id, "workflow", id, "deleted");
    return ok(undefined, "Slettet");
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Konteringsregler
// ---------------------------------------------------------------------------

export async function saveRuleAction(form: FormData): Promise<ActionResult> {
  try {
    const ctx = await actionContext("manageWorkflows");
    const s = (k: string) => String(form.get(k) ?? "").trim() || null;
    const accountNumber = s("accountNumber");
    if (!accountNumber) throw new Error("Vælg en konto");
    if (!s("supplierId") && !s("matchText")) throw new Error("Vælg en leverandør eller angiv tekst der skal matches");
    const name = s("name") ?? `${s("matchText") ?? "Leverandør"} → ${accountNumber}`;
    const values = {
      name,
      supplierId: s("supplierId"),
      matchText: s("matchText"),
      accountNumber,
      vatCode: s("vatCode"),
      propertyId: s("propertyId"),
      departmentCode: s("departmentCode"),
    };
    const id = s("id");
    if (id) await ctx.db.update(schema.codingRules).set(values).where(and(eq(schema.codingRules.id, id), eq(schema.codingRules.companyId, ctx.company.id)));
    else await ctx.db.insert(schema.codingRules).values({ companyId: ctx.company.id, ...values, source: "manual" });
    return ok(undefined, "Regel gemt");
  } catch (e) {
    return fail(e);
  }
}

export async function toggleRuleAction(id: string, active: boolean): Promise<ActionResult> {
  try {
    const ctx = await actionContext("manageWorkflows");
    await ctx.db.update(schema.codingRules).set({ active }).where(and(eq(schema.codingRules.id, id), eq(schema.codingRules.companyId, ctx.company.id)));
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function deleteRuleAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await actionContext("manageWorkflows");
    await ctx.db.delete(schema.codingRules).where(and(eq(schema.codingRules.id, id), eq(schema.codingRules.companyId, ctx.company.id)));
    return ok();
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Integrationer
// ---------------------------------------------------------------------------

async function upsertIntegration(
  ctx: Awaited<ReturnType<typeof actionContext>>,
  provider: string,
  values: { mode: string; status: string; config: Record<string, string> },
) {
  await ctx.db
    .insert(schema.integrations)
    .values({ companyId: ctx.company.id, provider, ...values })
    .onConflictDoUpdate({ target: [schema.integrations.companyId, schema.integrations.provider], set: { ...values, lastError: null } });
  await audit(ctx.db, ctx.company.id, ctx.user.id, "integration", null, values.status === "connected" ? "connected" : "disconnected", { provider, mode: values.mode });
}

export async function connectEconomicAction(form: FormData): Promise<ActionResult> {
  try {
    const ctx = await actionContext("manageIntegrations");
    const mode = form.get("mode") === "live" ? "live" : "sandbox";
    const config: Record<string, string> = {};
    if (mode === "live") {
      const grant = String(form.get("grantToken") ?? "").trim();
      if (!grant) throw new Error("Indsæt aftale-token (Agreement Grant Token) fra e-conomic");
      config.grantToken = encrypt(grant);
      const secret = String(form.get("appSecret") ?? "").trim();
      if (secret) config.appSecret = encrypt(secret);
      config.journalNumber = String(form.get("journalNumber") ?? "1") || "1";
    }
    await upsertIntegration(ctx, "economic", { mode, status: "connected", config });
    const r = await syncMasterData(ctx.db, ctx.company.id);
    return ok(undefined, `e-conomic forbundet: ${r.accounts} konti, ${r.vatCodes} momskoder, ${r.suppliers} nye leverandører`);
  } catch (e) {
    return fail(e);
  }
}

export async function syncEconomicAction(): Promise<ActionResult> {
  try {
    const ctx = await actionContext("manageIntegrations");
    const r = await syncMasterData(ctx.db, ctx.company.id);
    return ok(undefined, `Synkroniseret: ${r.accounts} konti, ${r.vatCodes} momskoder, ${r.suppliers} nye leverandører`);
  } catch (e) {
    return fail(e);
  }
}

export async function connectBoligflowAction(form: FormData): Promise<ActionResult> {
  try {
    const ctx = await actionContext("manageIntegrations");
    const mode = form.get("mode") === "live" ? "live" : "sandbox";
    const config: Record<string, string> = {};
    if (mode === "live") {
      const key = String(form.get("apiKey") ?? "").trim();
      if (!key) throw new Error("Indsæt API-nøglen fra Boligflow");
      config.apiKey = encrypt(key);
      const url = String(form.get("baseUrl") ?? "").trim();
      if (url) config.baseUrl = url;
    }
    await upsertIntegration(ctx, "boligflow", { mode, status: "connected", config });
    await ctx.db.update(schema.companies).set({ settings: { ...ctx.company.settings, propertyModule: true } }).where(eq(schema.companies.id, ctx.company.id));
    const r = await syncProperties(ctx.db, ctx.company.id);
    return ok(undefined, `Boligflow forbundet: ${r.properties} ejendomme hentet`);
  } catch (e) {
    return fail(e);
  }
}

export async function connectNemhandelAction(): Promise<ActionResult> {
  try {
    const ctx = await actionContext("manageIntegrations");
    if (!ctx.company.cvr) throw new Error("Tilføj CVR-nummer under Virksomhed først");
    const secret = randomToken(18);
    await upsertIntegration(ctx, "nemhandel", { mode: process.env.NEMHANDEL_PROVIDER ? "live" : "sandbox", status: "connected", config: { endpoint: ctx.company.cvr, webhookSecret: encrypt(secret) } });
    return ok(undefined, "NemHandel/Peppol-modtagelse aktiveret");
  } catch (e) {
    return fail(e);
  }
}

export async function saveAiKeyAction(form: FormData): Promise<ActionResult> {
  try {
    const ctx = await actionContext("manageIntegrations");
    const key = String(form.get("apiKey") ?? "").trim();
    if (!key) throw new Error("Indsæt en API-nøgle");
    if (!key.startsWith("sk-ant-")) throw new Error("Det ligner ikke en Anthropic API-nøgle (starter med sk-ant-)");
    await upsertIntegration(ctx, "ai", { mode: "live", status: "connected", config: { apiKey: encrypt(key) } });
    return ok(undefined, "Claude er aktiveret – nye fakturaer læses nu af Claude");
  } catch (e) {
    return fail(e);
  }
}

export async function disconnectIntegrationAction(provider: string): Promise<ActionResult> {
  try {
    const ctx = await actionContext("manageIntegrations");
    await ctx.db.delete(schema.integrations).where(and(eq(schema.integrations.companyId, ctx.company.id), eq(schema.integrations.provider, provider)));
    await audit(ctx.db, ctx.company.id, ctx.user.id, "integration", null, "disconnected", { provider });
    return ok(undefined, "Forbindelsen er fjernet");
  } catch (e) {
    return fail(e);
  }
}

export async function disconnectBankAction(connectionId: string): Promise<ActionResult> {
  try {
    const ctx = await actionContext("manageIntegrations");
    await ctx.db
      .update(schema.bankConnections)
      .set({ status: "expired" })
      .where(and(eq(schema.bankConnections.id, connectionId), eq(schema.bankConnections.companyId, ctx.company.id)));
    return ok(undefined, "Bankforbindelsen er afbrudt");
  } catch (e) {
    return fail(e);
  }
}

export async function finishOnboardingAction(): Promise<ActionResult> {
  try {
    const ctx = await actionContext("view");
    await ctx.db.update(schema.companies).set({ settings: { ...ctx.company.settings, onboardingDone: true } }).where(eq(schema.companies.id, ctx.company.id));
    return ok();
  } catch (e) {
    return fail(e);
  }
}
