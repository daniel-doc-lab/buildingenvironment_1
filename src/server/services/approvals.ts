import "server-only";
import { and, asc, eq, inArray, lte, gte, isNull, lt } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import type { WorkflowConditions, WorkflowStep } from "@/db/schema";
import { formatMoney, todayISO } from "@/lib/utils";
import { audit } from "../audit";
import { notify, companyUsersWithRoles } from "./notifications";
import { learnFromInvoice } from "./coding";
import { blockingFlags } from "./checks";
import { createPaymentForInvoice } from "./payments";
import { bookInvoice } from "./accounting";
import { rememberPaymentDetails } from "./suppliers";

type Invoice = typeof schema.invoices.$inferSelect;

export function workflowMatches(c: WorkflowConditions, inv: Invoice, ctx: { isNewSupplier: boolean; lineProperties: string[] }) {
  const amount = inv.totalAmount ?? 0;
  if (c.minAmount != null && amount < c.minAmount) return false;
  if (c.maxAmount != null && amount > c.maxAmount) return false;
  if (c.supplierIds?.length && (!inv.supplierId || !c.supplierIds.includes(inv.supplierId))) return false;
  if (c.propertyIds?.length) {
    const props = new Set([inv.propertyId, ...ctx.lineProperties].filter(Boolean));
    if (!c.propertyIds.some((p) => props.has(p))) return false;
  }
  if (c.departmentCodes?.length && (!inv.departmentCode || !c.departmentCodes.includes(inv.departmentCode))) return false;
  if (c.newSupplierOnly && !ctx.isNewSupplier) return false;
  if (c.kinds?.length && !c.kinds.includes(inv.kind)) return false;
  return true;
}

export function validateForApproval(inv: Invoice, lines: (typeof schema.invoiceLines.$inferSelect)[]) {
  const errors: string[] = [];
  if (!inv.supplierId && inv.kind !== "expense") errors.push("Vælg en leverandør");
  if (!inv.totalAmount) errors.push("Angiv totalbeløb");
  if (!inv.issueDate) errors.push("Angiv fakturadato");
  if (!lines.length) errors.push("Tilføj mindst én linje");
  if (lines.some((l) => !l.accountNumber)) errors.push("Alle linjer skal konteres");
  const critical = inv.flags.filter((f) => f.severity === "critical" && !f.dismissed);
  if (critical.length) errors.push("Løs eller afvis kritiske advarsler først");
  return errors;
}

async function activeDelegate(db: DB, companyId: string, userId: string) {
  const today = todayISO();
  const d = await db.query.delegations.findFirst({
    where: and(
      eq(schema.delegations.companyId, companyId),
      eq(schema.delegations.userId, userId),
      lte(schema.delegations.fromDate, today),
      gte(schema.delegations.toDate, today),
    ),
  });
  return d?.delegateId ?? null;
}

async function resolveStepUsers(db: DB, companyId: string, step: WorkflowStep, exclude: string | null) {
  let ids = [...step.approverIds];
  if (step.role) ids.push(...(await companyUsersWithRoles(db, companyId, [step.role])));
  ids = [...new Set(ids)];
  const out: { userId: string; delegatedFrom: string | null }[] = [];
  for (const id of ids) {
    const delegate = await activeDelegate(db, companyId, id);
    out.push(delegate ? { userId: delegate, delegatedFrom: id } : { userId: id, delegatedFrom: null });
  }
  // Funktionsadskillelse: man kan ikke godkende sit eget udlæg
  const filtered = exclude ? out.filter((o) => o.userId !== exclude) : out;
  if (filtered.length) return filtered;
  const fallback = await companyUsersWithRoles(db, companyId, ["owner", "admin"]);
  return fallback.filter((id) => id !== exclude).map((userId) => ({ userId, delegatedFrom: null }));
}

/** Sender fakturaen til godkendelse efter det første matchende godkendelsesflow. */
export async function submitForApproval(db: DB, invoiceId: string, userId: string | null, opts?: { auto?: boolean }) {
  const inv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, invoiceId) });
  if (!inv) throw new Error("Faktura findes ikke");
  if (!["review", "rejected", "pending_approval"].includes(inv.status)) throw new Error("Fakturaen kan ikke sendes til godkendelse i sin nuværende status");
  const lines = await db.select().from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, invoiceId));
  const errors = validateForApproval(inv, lines);
  if (errors.length) throw new Error(errors.join(". "));

  await db.delete(schema.approvals).where(eq(schema.approvals.invoiceId, invoiceId));
  const company = (await db.query.companies.findFirst({ where: eq(schema.companies.id, inv.companyId) }))!;
  const supplier = inv.supplierId ? await db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, inv.supplierId) }) : null;

  // Auto-godkendelse af små beløb fra betroede leverandører
  const threshold = company.settings.autoApproveBelow;
  if (threshold && supplier?.trusted && (inv.totalAmount ?? 0) <= threshold && !blockingFlags(inv.flags).length && inv.kind !== "expense") {
    await audit(db, inv.companyId, userId, "invoice", invoiceId, "auto_approved", { reason: "trusted_supplier_below_threshold" });
    await finalizeApproval(db, invoiceId, userId);
    return { status: "approved" as const, workflow: null };
  }

  const workflows = await db
    .select()
    .from(schema.approvalWorkflows)
    .where(and(eq(schema.approvalWorkflows.companyId, inv.companyId), eq(schema.approvalWorkflows.active, true)))
    .orderBy(asc(schema.approvalWorkflows.priority));
  const isNewSupplier = inv.flags.some((f) => f.code === "new_supplier");
  const lineProperties = lines.map((l) => l.propertyId).filter((p): p is string => !!p);
  const wf = workflows.find((w) => workflowMatches(w.conditions, inv, { isNewSupplier, lineProperties }));

  if (!wf || wf.steps.length === 0) {
    await audit(db, inv.companyId, userId, "invoice", invoiceId, "auto_approved", { reason: "no_workflow" });
    await finalizeApproval(db, invoiceId, userId);
    return { status: "approved" as const, workflow: null };
  }

  const exclude = inv.kind === "expense" ? inv.expenseUserId : null;
  const rows: (typeof schema.approvals.$inferInsert)[] = [];
  for (const [i, step] of wf.steps.entries()) {
    const users = await resolveStepUsers(db, inv.companyId, step, exclude);
    for (const u of users) {
      rows.push({
        invoiceId,
        workflowId: wf.id,
        stepIndex: i,
        stepName: step.name,
        userId: u.userId,
        delegatedFrom: u.delegatedFrom,
        mode: step.mode,
        status: i === 0 ? "pending" : "waiting",
      });
    }
  }
  if (rows.length) await db.insert(schema.approvals).values(rows);
  await db.update(schema.invoices).set({ status: "pending_approval", rejectedReason: null }).where(eq(schema.invoices.id, invoiceId));
  await audit(db, inv.companyId, userId, "invoice", invoiceId, opts?.auto ? "auto_submitted" : "submitted", { workflow: wf.name });
  await notifyStep(db, inv, 0);
  return { status: "pending_approval" as const, workflow: wf.name };
}

async function notifyStep(db: DB, inv: Invoice, stepIndex: number) {
  const pending = await db
    .select({ userId: schema.approvals.userId })
    .from(schema.approvals)
    .where(and(eq(schema.approvals.invoiceId, inv.id), eq(schema.approvals.stepIndex, stepIndex), eq(schema.approvals.status, "pending")));
  await notify(db, {
    companyId: inv.companyId,
    userIds: pending.map((p) => p.userId),
    type: "approval_request",
    title: `Godkend ${inv.kind === "expense" ? "udlæg" : "faktura"} fra ${inv.supplierName ?? "ukendt"}`,
    body: `${formatMoney(inv.totalAmount, inv.currency)}${inv.dueDate ? ` · forfalder ${inv.dueDate}` : ""}${inv.description ? ` · ${inv.description}` : ""}`,
    link: `/app/invoices/${inv.id}`,
    email: true,
  });
}

/** Registrerer en godkenders beslutning og flytter flowet videre. */
export async function decide(db: DB, invoiceId: string, userId: string, decision: "approve" | "reject", comment?: string | null) {
  const inv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, invoiceId) });
  if (!inv || inv.status !== "pending_approval") throw new Error("Fakturaen afventer ikke godkendelse");
  const mine = await db
    .select()
    .from(schema.approvals)
    .where(and(eq(schema.approvals.invoiceId, invoiceId), eq(schema.approvals.userId, userId), eq(schema.approvals.status, "pending")));
  if (!mine.length) throw new Error("Du har ikke en afventende godkendelse på denne faktura");
  const now = new Date();

  if (decision === "reject") {
    await db
      .update(schema.approvals)
      .set({ status: "rejected", decidedAt: now, comment: comment ?? null })
      .where(inArray(schema.approvals.id, mine.map((m) => m.id)));
    await db
      .update(schema.approvals)
      .set({ status: "skipped" })
      .where(and(eq(schema.approvals.invoiceId, invoiceId), inArray(schema.approvals.status, ["pending", "waiting"])));
    await db.update(schema.invoices).set({ status: "rejected", rejectedReason: comment ?? null }).where(eq(schema.invoices.id, invoiceId));
    if (comment) await db.insert(schema.comments).values({ invoiceId, userId, body: `Afvist: ${comment}` });
    await audit(db, inv.companyId, userId, "invoice", invoiceId, "rejected", { comment });
    const accountants = await companyUsersWithRoles(db, inv.companyId, ["accountant", "admin", "owner"]);
    await notify(db, {
      companyId: inv.companyId,
      userIds: [...(inv.submittedBy ? [inv.submittedBy] : []), ...accountants].filter((u) => u !== userId),
      type: "rejected",
      title: `Faktura fra ${inv.supplierName ?? "ukendt"} blev afvist`,
      body: comment ?? undefined,
      link: `/app/invoices/${inv.id}`,
    });
    return { status: "rejected" as const };
  }

  await db
    .update(schema.approvals)
    .set({ status: "approved", decidedAt: now, comment: comment ?? null })
    .where(inArray(schema.approvals.id, mine.map((m) => m.id)));
  if (comment) await db.insert(schema.comments).values({ invoiceId, userId, body: comment });
  await audit(db, inv.companyId, userId, "invoice", invoiceId, "approved_step", { step: mine[0]!.stepName });

  const stepIndex = mine[0]!.stepIndex;
  const stepRows = await db
    .select()
    .from(schema.approvals)
    .where(and(eq(schema.approvals.invoiceId, invoiceId), eq(schema.approvals.stepIndex, stepIndex)));
  const mode = stepRows[0]?.mode ?? "any";
  const complete = mode === "any" ? stepRows.some((r) => r.status === "approved") : stepRows.every((r) => r.status === "approved");
  if (!complete) return { status: "pending_approval" as const };

  if (mode === "any") {
    await db
      .update(schema.approvals)
      .set({ status: "skipped" })
      .where(and(eq(schema.approvals.invoiceId, invoiceId), eq(schema.approvals.stepIndex, stepIndex), eq(schema.approvals.status, "pending")));
  }
  const next = await db
    .select()
    .from(schema.approvals)
    .where(and(eq(schema.approvals.invoiceId, invoiceId), eq(schema.approvals.status, "waiting")))
    .orderBy(asc(schema.approvals.stepIndex));
  if (next.length) {
    const nextIdx = next[0]!.stepIndex;
    await db
      .update(schema.approvals)
      .set({ status: "pending" })
      .where(and(eq(schema.approvals.invoiceId, invoiceId), eq(schema.approvals.stepIndex, nextIdx), eq(schema.approvals.status, "waiting")));
    // Samme person i næste trin? Så er trinnet allerede godkendt (undgå dobbeltgodkendelse)
    await notifyStep(db, inv, nextIdx);
    return { status: "pending_approval" as const };
  }
  await finalizeApproval(db, invoiceId, userId);
  return { status: "approved" as const };
}

/** Endelig godkendelse: lær kontering, bogfør, planlæg betaling. */
export async function finalizeApproval(db: DB, invoiceId: string, userId: string | null) {
  const inv = (await db.query.invoices.findFirst({ where: eq(schema.invoices.id, invoiceId) }))!;
  await db.update(schema.invoices).set({ status: "approved" }).where(eq(schema.invoices.id, invoiceId));
  await audit(db, inv.companyId, userId, "invoice", invoiceId, "approved");
  await learnFromInvoice(db, invoiceId);
  if (inv.supplierId) await rememberPaymentDetails(db, inv.supplierId, inv);

  try {
    await bookInvoice(db, invoiceId);
  } catch (e) {
    await audit(db, inv.companyId, null, "invoice", invoiceId, "booking_failed", { error: (e as Error).message });
  }

  if (inv.kind === "credit_note" || ["betalingsservice", "card", "none"].includes(inv.paymentMethod ?? "")) {
    await db.update(schema.invoices).set({ status: "archived" }).where(eq(schema.invoices.id, invoiceId));
    return;
  }
  await createPaymentForInvoice(db, invoiceId);

  if (inv.submittedBy && inv.submittedBy !== userId) {
    await notify(db, {
      companyId: inv.companyId,
      userIds: [inv.submittedBy],
      type: "approved",
      title: `${inv.kind === "expense" ? "Dit udlæg" : "Faktura"} fra ${inv.supplierName ?? "ukendt"} er godkendt`,
      link: `/app/invoices/${inv.id}`,
    });
  }
}

/** Påmindelser til godkendere der ikke har reageret. */
export async function sendReminders(db: DB) {
  const cutoff = new Date(Date.now() - 24 * 3600_000);
  const stale = await db
    .select({ a: schema.approvals, inv: schema.invoices })
    .from(schema.approvals)
    .innerJoin(schema.invoices, eq(schema.invoices.id, schema.approvals.invoiceId))
    .where(
      and(
        eq(schema.approvals.status, "pending"),
        lt(schema.approvals.createdAt, cutoff),
        isNull(schema.approvals.remindedAt),
      ),
    );
  for (const { a, inv } of stale) {
    await notify(db, {
      companyId: inv.companyId,
      userIds: [a.userId],
      type: "reminder",
      title: `Påmindelse: faktura fra ${inv.supplierName ?? "ukendt"} venter på dig`,
      body: `${formatMoney(inv.totalAmount)}${inv.dueDate ? ` · forfalder ${inv.dueDate}` : ""}`,
      link: `/app/invoices/${inv.id}`,
      email: true,
    });
    await db.update(schema.approvals).set({ remindedAt: new Date() }).where(eq(schema.approvals.id, a.id));
  }
  return stale.length;
}
