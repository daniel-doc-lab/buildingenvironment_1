import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { readSession } from "./session";
import type { Role } from "@/db/schema";

export type Ctx = Awaited<ReturnType<typeof loadContext>>;

const ROLE_RANK: Record<Role, number> = { owner: 6, admin: 5, accountant: 4, approver: 3, member: 2, auditor: 1 };

export const PERMISSIONS = {
  manageCompany: ["owner", "admin"],
  manageUsers: ["owner", "admin"],
  manageIntegrations: ["owner", "admin", "accountant"],
  manageWorkflows: ["owner", "admin", "accountant"],
  editInvoices: ["owner", "admin", "accountant"],
  approve: ["owner", "admin", "accountant", "approver"],
  pay: ["owner", "admin", "accountant"],
  signPayments: ["owner", "admin"],
  submitExpenses: ["owner", "admin", "accountant", "approver", "member"],
  view: ["owner", "admin", "accountant", "approver", "member", "auditor"],
} satisfies Record<string, Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, perm: Permission) {
  return (PERMISSIONS[perm] as readonly Role[]).includes(role);
}

async function loadContext() {
  const session = await readSession();
  if (!session) return null;
  const db = await getDb();
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, session.uid) });
  if (!user) return null;
  const mships = await db
    .select({ company: schema.companies, role: schema.memberships.role })
    .from(schema.memberships)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.memberships.companyId))
    .where(eq(schema.memberships.userId, user.id));
  const current =
    mships.find((m) => m.company.id === session.cid) ??
    mships.find((m) => m.company.id === user.lastCompanyId) ??
    mships[0];
  return {
    db,
    user,
    companies: mships.map((m) => ({ ...m.company, role: m.role })),
    company: current?.company ?? null,
    role: (current?.role ?? "member") as Role,
  };
}

export const getContext = cache(loadContext);

/** Kræver login + valgt virksomhed; redirecter ellers. */
export async function requireCompany(perm: Permission = "view") {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (!ctx.company) redirect("/onboarding");
  if (!can(ctx.role, perm)) redirect("/app?denied=1");
  return ctx as Omit<NonNullable<Ctx>, "company"> & { company: NonNullable<NonNullable<Ctx>["company"]> };
}

/** Til server actions: kaster i stedet for redirect. */
export async function actionContext(perm: Permission = "view") {
  const ctx = await getContext();
  if (!ctx || !ctx.company) throw new Error("Du er ikke logget ind");
  if (!can(ctx.role, perm)) throw new Error("Du har ikke rettigheder til denne handling");
  return ctx as Omit<NonNullable<Ctx>, "company"> & { company: NonNullable<NonNullable<Ctx>["company"]> };
}

export function roleAtLeast(role: Role, min: Role) {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export async function getMembership(userId: string, companyId: string) {
  const db = await getDb();
  return db.query.memberships.findFirst({
    where: and(eq(schema.memberships.userId, userId), eq(schema.memberships.companyId, companyId)),
  });
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Ejer",
  admin: "Administrator",
  accountant: "Bogholder",
  approver: "Godkender",
  member: "Medarbejder",
  auditor: "Revisor (læseadgang)",
};
