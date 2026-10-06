import { and, desc, eq, ilike } from "drizzle-orm";
import type { Database } from "@/db/client";
import { auditEvents } from "@/db/schema";
import type { TenantScope } from "@/lib/tenancy";

export async function listAuditEvents(
  db: Database,
  scope: TenantScope,
  input: {
    action?: string | null;
    resourceType?: string | null;
    resourceId?: string | null;
    limit?: number;
  } = {},
) {
  const conditions = [
    eq(auditEvents.organizationId, scope.organizationId),
  ];

  if (input.action?.trim()) {
    conditions.push(
      ilike(auditEvents.action, `%${input.action.trim()}%`),
    );
  }
  if (input.resourceType?.trim()) {
    conditions.push(
      eq(auditEvents.resourceType, input.resourceType.trim()),
    );
  }
  if (input.resourceId?.trim()) {
    conditions.push(
      eq(auditEvents.resourceId, input.resourceId.trim()),
    );
  }

  const limit = Math.min(
    Math.max(input.limit ?? 200, 1),
    500,
  );

  return db
    .select()
    .from(auditEvents)
    .where(and(...conditions))
    .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
    .limit(limit);
}
