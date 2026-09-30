import "server-only";
import type { DB } from "@/db";
import { schema } from "@/db";

export async function audit(
  db: DB,
  companyId: string,
  userId: string | null,
  entityType: string,
  entityId: string | null,
  action: string,
  data?: Record<string, unknown>,
) {
  await db.insert(schema.auditLog).values({ companyId, userId, entityType, entityId, action, data });
}
