"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { createSession, destroySession, readSession } from "@/server/session";
import { slugify } from "@/lib/utils";
import { normalizeCvr } from "@/lib/banking";
import { STANDARD_ACCOUNTS, STANDARD_DEPARTMENTS, STANDARD_VAT } from "@/integrations/accounting/standard-chart";
import { DEMO_PASSWORD } from "@/server/demo/catalog";
import { audit } from "@/server/audit";
import { lookupCvr } from "@/integrations/cvr";

export type FormState = { error?: string; ok?: boolean; data?: Record<string, string | null> } | undefined;

function safeNext(next: unknown) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/app";
}

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const db = await getDb();
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return { error: "Forkert e-mail eller adgangskode" };
  await createSession({ uid: user.id, cid: user.lastCompanyId ?? undefined });
  redirect(safeNext(form.get("next")));
}

export async function demoLoginAction(form: FormData) {
  const as = String(form.get("as") ?? "demo@fluks.dk");
  const db = await getDb();
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, as) });
  if (!user || !(await bcrypt.compare(DEMO_PASSWORD, user.passwordHash))) redirect("/login?error=demo");
  await createSession({ uid: user.id });
  redirect("/app");
}

const SignupSchema = z.object({
  name: z.string().min(2, "Skriv dit navn"),
  email: z.email("Ugyldig e-mail"),
  password: z.string().min(8, "Adgangskoden skal være mindst 8 tegn"),
  companyName: z.string().min(2, "Skriv virksomhedens navn"),
  cvr: z.string().optional(),
});

export async function signupAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = SignupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { name, email, password, companyName } = parsed.data;
  const db = await getDb();
  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email.toLowerCase()) });
  if (existing) return { error: "Der findes allerede en bruger med den e-mail" };
  const invitationToken = form.get("invite") ? String(form.get("invite")) : null;

  const [user] = await db
    .insert(schema.users)
    .values({ email: email.toLowerCase(), name, passwordHash: await bcrypt.hash(password, 10) })
    .returning();

  if (invitationToken) {
    const inv = await db.query.invitations.findFirst({ where: eq(schema.invitations.token, invitationToken) });
    if (inv && !inv.acceptedAt) {
      await db.insert(schema.memberships).values({ userId: user!.id, companyId: inv.companyId, role: inv.role });
      await db.update(schema.invitations).set({ acceptedAt: new Date() }).where(eq(schema.invitations.id, inv.id));
      await createSession({ uid: user!.id, cid: inv.companyId });
      redirect("/app");
    }
  }

  const companyId = await createCompany(user!.id, companyName, parsed.data.cvr ?? null);
  await createSession({ uid: user!.id, cid: companyId });
  redirect("/onboarding");
}

async function createCompany(userId: string, name: string, cvrInput: string | null) {
  const db = await getDb();
  const cvr = normalizeCvr(cvrInput);
  const info = cvr ? await lookupCvr(cvr) : null;
  const [company] = await db
    .insert(schema.companies)
    .values({
      name: info?.name ?? name,
      cvr,
      address: info ? [info.address, [info.zip, info.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") : null,
      slug: `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`,
      settings: { paymentLeadDays: 1, fourEyesThreshold: 5_000_000, reminderHours: 24, propertyModule: false },
    })
    .returning();
  await db.insert(schema.memberships).values({ userId, companyId: company!.id, role: "owner" });
  await db.update(schema.users).set({ lastCompanyId: company!.id }).where(eq(schema.users.id, userId));
  // Standardkontoplan indtil regnskabsprogrammet forbindes
  await db.insert(schema.accounts).values(STANDARD_ACCOUNTS.map((a) => ({ companyId: company!.id, ...a })));
  await db.insert(schema.vatCodes).values(STANDARD_VAT.map((v) => ({ companyId: company!.id, ...v })));
  await db.insert(schema.departments).values(STANDARD_DEPARTMENTS.map((d) => ({ companyId: company!.id, ...d })));
  await db.insert(schema.approvalWorkflows).values({
    companyId: company!.id,
    name: "Alle fakturaer",
    priority: 100,
    conditions: {},
    steps: [{ name: "Ejer", approverIds: [userId], role: null, mode: "any" }],
  });
  await audit(db, company!.id, userId, "company", company!.id, "created");
  return company!.id;
}

export async function createAdditionalCompanyAction(_: FormState, form: FormData): Promise<FormState> {
  const session = await readSession();
  if (!session) redirect("/login");
  const name = String(form.get("companyName") ?? "").trim();
  if (name.length < 2) return { error: "Skriv virksomhedens navn" };
  const id = await createCompany(session.uid, name, String(form.get("cvr") ?? ""));
  await createSession({ uid: session.uid, cid: id });
  redirect("/onboarding");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function switchCompanyAction(form: FormData) {
  const session = await readSession();
  if (!session) redirect("/login");
  const cid = String(form.get("companyId"));
  const db = await getDb();
  const m = await db.query.memberships.findFirst({
    where: (t, { and, eq }) => and(eq(t.userId, session.uid), eq(t.companyId, cid)),
  });
  if (m) {
    await db.update(schema.users).set({ lastCompanyId: cid }).where(eq(schema.users.id, session.uid));
    await createSession({ uid: session.uid, cid });
  }
  redirect("/app");
}

export async function cvrLookupAction(cvr: string) {
  const info = await lookupCvr(cvr);
  return info;
}
