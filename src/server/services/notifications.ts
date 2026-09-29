import "server-only";
import { eq, inArray } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import { sendEmail, emailLayout } from "@/integrations/email";

export async function notify(
  db: DB,
  opts: {
    companyId: string;
    userIds: string[];
    type: string;
    title: string;
    body?: string;
    link?: string;
    email?: boolean;
  },
) {
  if (opts.userIds.length === 0) return;
  const unique = [...new Set(opts.userIds)];
  await db.insert(schema.notifications).values(
    unique.map((userId) => ({
      companyId: opts.companyId,
      userId,
      type: opts.type,
      title: opts.title,
      body: opts.body ?? null,
      link: opts.link ?? null,
      emailedAt: opts.email ? new Date() : null,
    })),
  );
  if (opts.email) {
    const users = await db.select().from(schema.users).where(inArray(schema.users.id, unique));
    const base = process.env.APP_URL ?? "http://localhost:3000";
    for (const u of users) {
      await sendEmail(db, {
        companyId: opts.companyId,
        to: u.email,
        subject: opts.title,
        html: emailLayout(opts.title, opts.body ?? "", opts.link ? { href: base + opts.link, label: "Åbn i Fluks" } : undefined),
      });
    }
  }
}

export async function companyUsersWithRoles(db: DB, companyId: string, roles: string[]) {
  const rows = await db
    .select({ id: schema.users.id, role: schema.memberships.role })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.memberships.companyId, companyId));
  return rows.filter((r) => roles.includes(r.role)).map((r) => r.id);
}
