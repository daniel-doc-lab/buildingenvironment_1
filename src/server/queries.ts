import "server-only";
import { and, eq, inArray, isNull, sql, desc } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";

export async function navCounts(db: DB, companyId: string, userId: string) {
  const [review] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.invoices)
    .where(and(eq(schema.invoices.companyId, companyId), inArray(schema.invoices.status, ["review", "processing"])));
  const [mine] = await db
    .select({ n: sql<number>`count(distinct ${schema.approvals.invoiceId})::int` })
    .from(schema.approvals)
    .innerJoin(schema.invoices, eq(schema.invoices.id, schema.approvals.invoiceId))
    .where(and(eq(schema.invoices.companyId, companyId), eq(schema.approvals.userId, userId), eq(schema.approvals.status, "pending")));
  const [toPay] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.payments)
    .where(and(eq(schema.payments.companyId, companyId), eq(schema.payments.status, "planned")));
  const [unmatched] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.bankTransactions)
    .where(and(eq(schema.bankTransactions.companyId, companyId), eq(schema.bankTransactions.status, "unmatched")));
  const [unread] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.companyId, companyId), eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)));
  return { review: review?.n ?? 0, approvals: mine?.n ?? 0, toPay: toPay?.n ?? 0, unmatched: unmatched?.n ?? 0, unread: unread?.n ?? 0 };
}

export async function recentNotifications(db: DB, companyId: string, userId: string) {
  return db
    .select()
    .from(schema.notifications)
    .where(and(eq(schema.notifications.companyId, companyId), eq(schema.notifications.userId, userId)))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(12);
}

export async function dashboardData(db: DB, companyId: string, userId: string) {
  const { todayISO, addDays } = await import("@/lib/utils");
  const today = todayISO();
  const in7 = addDays(today, 7);
  const monthStart = today.slice(0, 8) + "01";
  const sixMonthsAgo = (() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 5);
    return d.toISOString().slice(0, 10);
  })();

  const [open, myPending, dueSoon, paidMonth, accounts, monthly, activity, flagged, upcoming, autoStats, batches] = await Promise.all([
    db
      .select({ status: schema.invoices.status, n: sql<number>`count(*)::int`, sum: sql<number>`coalesce(sum(${schema.invoices.totalAmount}),0)::bigint` })
      .from(schema.invoices)
      .where(and(eq(schema.invoices.companyId, companyId), inArray(schema.invoices.status, ["review", "pending_approval", "approved", "scheduled"])))
      .groupBy(schema.invoices.status),
    db
      .select({ n: sql<number>`count(distinct ${schema.approvals.invoiceId})::int`, sum: sql<number>`coalesce(sum(${schema.invoices.totalAmount}),0)::bigint` })
      .from(schema.approvals)
      .innerJoin(schema.invoices, eq(schema.invoices.id, schema.approvals.invoiceId))
      .where(and(eq(schema.invoices.companyId, companyId), eq(schema.approvals.userId, userId), eq(schema.approvals.status, "pending"))),
    db
      .select({ n: sql<number>`count(*)::int`, sum: sql<number>`coalesce(sum(${schema.invoices.totalAmount}),0)::bigint` })
      .from(schema.invoices)
      .where(
        and(
          eq(schema.invoices.companyId, companyId),
          inArray(schema.invoices.status, ["review", "pending_approval", "approved", "scheduled"]),
          sql`${schema.invoices.dueDate} <= ${in7}`,
        ),
      ),
    db
      .select({ n: sql<number>`count(*)::int`, sum: sql<number>`coalesce(sum(${schema.invoices.totalAmount}),0)::bigint` })
      .from(schema.invoices)
      .where(and(eq(schema.invoices.companyId, companyId), eq(schema.invoices.status, "paid"), sql`${schema.invoices.paidAt} >= ${monthStart}::date`)),
    db.select().from(schema.bankAccounts).where(eq(schema.bankAccounts.companyId, companyId)),
    db
      .select({ month: sql<string>`substr(${schema.invoices.issueDate}::text, 1, 7)`, sum: sql<number>`coalesce(sum(${schema.invoices.amountExVat}),0)::bigint`, n: sql<number>`count(*)::int` })
      .from(schema.invoices)
      .where(
        and(
          eq(schema.invoices.companyId, companyId),
          inArray(schema.invoices.status, ["approved", "scheduled", "paid", "archived", "pending_approval"]),
          sql`${schema.invoices.issueDate} >= ${sixMonthsAgo}`,
          sql`${schema.invoices.kind} <> 'credit_note'`,
        ),
      )
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({ log: schema.auditLog, user: schema.users.name, supplier: schema.invoices.supplierName })
      .from(schema.auditLog)
      .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.userId))
      .leftJoin(schema.invoices, eq(schema.invoices.id, schema.auditLog.entityId))
      .where(eq(schema.auditLog.companyId, companyId))
      .orderBy(desc(schema.auditLog.createdAt))
      .limit(10),
    db
      .select()
      .from(schema.invoices)
      .where(and(eq(schema.invoices.companyId, companyId), inArray(schema.invoices.status, ["review", "pending_approval"]))),
    db
      .select()
      .from(schema.payments)
      .where(and(eq(schema.payments.companyId, companyId), inArray(schema.payments.status, ["planned", "in_batch", "submitted"])))
      .orderBy(schema.payments.executionDate)
      .limit(6),
    db
      .select({
        total: sql<number>`count(*)::int`,
        auto: sql<number>`count(*) filter (where exists (select 1 from ${schema.auditLog} a where a.entity_id = "invoices"."id" and a.action in ('auto_submitted','auto_approved')))::int`,
        ai: sql<number>`count(*) filter (where ${schema.invoices.extraction} is not null)::int`,
      })
      .from(schema.invoices)
      .where(and(eq(schema.invoices.companyId, companyId), sql`${schema.invoices.createdAt} >= now() - interval '30 days'`)),
    db
      .select()
      .from(schema.paymentBatches)
      .where(and(eq(schema.paymentBatches.companyId, companyId), inArray(schema.paymentBatches.status, ["awaiting_second_approval", "awaiting_signature"]))),
  ]);
  const unmatched = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.bankTransactions)
    .where(and(eq(schema.bankTransactions.companyId, companyId), eq(schema.bankTransactions.status, "unmatched")));
  const plannedCount = await db
    .select({ n: sql<number>`count(*)::int`, sum: sql<number>`coalesce(sum(${schema.payments.amount}),0)::bigint` })
    .from(schema.payments)
    .where(and(eq(schema.payments.companyId, companyId), eq(schema.payments.status, "planned")));

  return {
    open,
    myPending: myPending[0] ?? { n: 0, sum: 0 },
    dueSoon: dueSoon[0] ?? { n: 0, sum: 0 },
    paidMonth: paidMonth[0] ?? { n: 0, sum: 0 },
    balance: accounts.reduce((s, a) => s + (a.balance ?? 0), 0),
    accounts,
    monthly,
    activity,
    flagged: flagged.filter((f) => f.flags.some((x) => !x.dismissed && x.severity !== "info")),
    review: flagged.filter((f) => f.status === "review"),
    discounts: flagged.filter((f) => f.flags.some((x) => x.code === "discount_available")),
    upcoming,
    autoStats: autoStats[0] ?? { total: 0, auto: 0, ai: 0 },
    batches,
    unmatched: unmatched[0]?.n ?? 0,
    planned: plannedCount[0] ?? { n: 0, sum: 0 },
  };
}

export const INBOX_TABS = {
  review: { label: "Til gennemsyn", statuses: ["review", "processing"] },
  pending: { label: "Afventer godkendelse", statuses: ["pending_approval"] },
  approved: { label: "Godkendt", statuses: ["approved", "scheduled"] },
  paid: { label: "Betalt", statuses: ["paid", "archived"] },
  rejected: { label: "Afvist", statuses: ["rejected"] },
  all: { label: "Alle", statuses: null },
} as const;
export type InboxTab = keyof typeof INBOX_TABS;

export async function listInvoices(db: DB, companyId: string, opts: { tab: InboxTab; q?: string; kind?: string; supplierId?: string; propertyId?: string; limit?: number }) {
  const { ilike, or } = await import("drizzle-orm");
  const conds = [eq(schema.invoices.companyId, companyId)];
  const statuses = INBOX_TABS[opts.tab].statuses;
  if (statuses) conds.push(inArray(schema.invoices.status, [...statuses]));
  if (opts.kind) conds.push(eq(schema.invoices.kind, opts.kind));
  if (opts.supplierId) conds.push(eq(schema.invoices.supplierId, opts.supplierId));
  if (opts.propertyId) conds.push(eq(schema.invoices.propertyId, opts.propertyId));
  if (opts.q) {
    const q = `%${opts.q}%`;
    const digits = opts.q.replace(/\D/g, "");
    conds.push(
      or(
        ilike(schema.invoices.supplierName, q),
        ilike(schema.invoices.invoiceNumber, q),
        ilike(schema.invoices.description, q),
        digits.length >= 3 ? sql`${schema.invoices.totalAmount}::text like ${`%${digits}%`}` : undefined,
      )!,
    );
  }
  const rows = await db
    .select({ inv: schema.invoices, property: schema.properties.name })
    .from(schema.invoices)
    .leftJoin(schema.properties, eq(schema.properties.id, schema.invoices.propertyId))
    .where(and(...conds))
    .orderBy(opts.tab === "paid" ? desc(schema.invoices.paidAt) : opts.tab === "all" ? desc(schema.invoices.createdAt) : sql`${schema.invoices.dueDate} asc nulls last`)
    .limit(opts.limit ?? 300);
  const counts = await db
    .select({ status: schema.invoices.status, n: sql<number>`count(*)::int` })
    .from(schema.invoices)
    .where(and(eq(schema.invoices.companyId, companyId), opts.kind ? eq(schema.invoices.kind, opts.kind) : undefined))
    .groupBy(schema.invoices.status);
  const tabCounts = Object.fromEntries(
    Object.entries(INBOX_TABS).map(([k, t]) => [k, t.statuses ? counts.filter((c) => (t.statuses as readonly string[]).includes(c.status)).reduce((s, c) => s + c.n, 0) : counts.reduce((s, c) => s + c.n, 0)]),
  ) as Record<InboxTab, number>;
  return { rows, tabCounts };
}

export async function invoiceDetail(db: DB, companyId: string, id: string) {
  const inv = await db.query.invoices.findFirst({ where: and(eq(schema.invoices.id, id), eq(schema.invoices.companyId, companyId)) });
  if (!inv) return null;
  const [lines, supplier, approvals, comments, payments, file, accounts, vatCodes, properties, units, departments, history, trail, suppliers] = await Promise.all([
    db.select().from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, id)).orderBy(schema.invoiceLines.position),
    inv.supplierId ? db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, inv.supplierId) }) : Promise.resolve(undefined),
    db
      .select({ a: schema.approvals, name: schema.users.name })
      .from(schema.approvals)
      .innerJoin(schema.users, eq(schema.users.id, schema.approvals.userId))
      .where(eq(schema.approvals.invoiceId, id))
      .orderBy(schema.approvals.stepIndex),
    db
      .select({ c: schema.comments, name: schema.users.name })
      .from(schema.comments)
      .leftJoin(schema.users, eq(schema.users.id, schema.comments.userId))
      .where(eq(schema.comments.invoiceId, id))
      .orderBy(schema.comments.createdAt),
    db.select().from(schema.payments).where(eq(schema.payments.invoiceId, id)).orderBy(desc(schema.payments.createdAt)),
    inv.fileId ? db.select({ id: schema.files.id, name: schema.files.name, mime: schema.files.mime, size: schema.files.size }).from(schema.files).where(eq(schema.files.id, inv.fileId)) : Promise.resolve([]),
    db.select().from(schema.accounts).where(and(eq(schema.accounts.companyId, companyId), eq(schema.accounts.active, true))).orderBy(schema.accounts.number),
    db.select().from(schema.vatCodes).where(eq(schema.vatCodes.companyId, companyId)),
    db.select().from(schema.properties).where(eq(schema.properties.companyId, companyId)).orderBy(schema.properties.name),
    db
      .select({ u: schema.units })
      .from(schema.units)
      .innerJoin(schema.properties, eq(schema.properties.id, schema.units.propertyId))
      .where(eq(schema.properties.companyId, companyId)),
    db.select().from(schema.departments).where(eq(schema.departments.companyId, companyId)),
    inv.supplierId
      ? db
          .select()
          .from(schema.invoices)
          .where(and(eq(schema.invoices.supplierId, inv.supplierId), sql`${schema.invoices.id} <> ${id}`))
          .orderBy(desc(schema.invoices.issueDate))
          .limit(6)
      : Promise.resolve([]),
    db
      .select({ log: schema.auditLog, name: schema.users.name })
      .from(schema.auditLog)
      .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.userId))
      .where(and(eq(schema.auditLog.companyId, companyId), eq(schema.auditLog.entityId, id)))
      .orderBy(schema.auditLog.createdAt),
    db.select({ id: schema.suppliers.id, name: schema.suppliers.name, cvr: schema.suppliers.cvr }).from(schema.suppliers).where(eq(schema.suppliers.companyId, companyId)).orderBy(schema.suppliers.name),
  ]);
  const members = await db
    .select({ id: schema.users.id, name: schema.users.name })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.memberships.companyId, companyId));
  return { inv, lines, supplier, approvals, comments, payments, file: file[0] ?? null, accounts, vatCodes, properties, units: units.map((u) => u.u), departments, history, trail, suppliers, members };
}

export async function approvalQueue(db: DB, companyId: string, userId: string, scope: "mine" | "all" | "history") {
  if (scope === "history") {
    return db
      .select({ a: schema.approvals, inv: schema.invoices, name: schema.users.name })
      .from(schema.approvals)
      .innerJoin(schema.invoices, eq(schema.invoices.id, schema.approvals.invoiceId))
      .innerJoin(schema.users, eq(schema.users.id, schema.approvals.userId))
      .where(and(eq(schema.invoices.companyId, companyId), eq(schema.approvals.userId, userId), inArray(schema.approvals.status, ["approved", "rejected"])))
      .orderBy(desc(schema.approvals.decidedAt))
      .limit(100);
  }
  return db
    .select({ a: schema.approvals, inv: schema.invoices, name: schema.users.name })
    .from(schema.approvals)
    .innerJoin(schema.invoices, eq(schema.invoices.id, schema.approvals.invoiceId))
    .innerJoin(schema.users, eq(schema.users.id, schema.approvals.userId))
    .where(
      and(
        eq(schema.invoices.companyId, companyId),
        eq(schema.approvals.status, "pending"),
        scope === "mine" ? eq(schema.approvals.userId, userId) : undefined,
      ),
    )
    .orderBy(sql`${schema.invoices.dueDate} asc nulls last`);
}

export async function linesForInvoices(db: DB, companyId: string, ids: string[]) {
  if (!ids.length) return [];
  return db
    .select({ l: schema.invoiceLines, accountName: schema.accounts.name, property: schema.properties.name })
    .from(schema.invoiceLines)
    .innerJoin(schema.invoices, eq(schema.invoices.id, schema.invoiceLines.invoiceId))
    .leftJoin(schema.accounts, and(eq(schema.accounts.companyId, companyId), eq(schema.accounts.number, schema.invoiceLines.accountNumber)))
    .leftJoin(schema.properties, eq(schema.properties.id, schema.invoiceLines.propertyId))
    .where(inArray(schema.invoiceLines.invoiceId, ids));
}
