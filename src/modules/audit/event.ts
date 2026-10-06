import { randomUUID } from "node:crypto";
import type { auditEvents } from "@/db/schema";

export type AuditEventInsert = typeof auditEvents.$inferInsert;

export const auditActorTypes = [
  "user",
  "anonymous",
  "system",
] as const;

export type AuditActorType =
  (typeof auditActorTypes)[number];

export interface AuditEventInput {
  organizationId: string;
  actorType: AuditActorType;
  actorUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  parentResourceType?: string | null;
  parentResourceId?: string | null;
  correlationId?: string;
  source?: string;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}

export function auditEventValues(
  input: AuditEventInput,
): AuditEventInsert {
  return {
    organizationId: input.organizationId,
    occurredAt: input.occurredAt ?? new Date(),
    actorType: input.actorType,
    actorUserId: input.actorUserId ?? null,
    action: requireToken(input.action, "action"),
    resourceType: requireToken(
      input.resourceType,
      "resourceType",
    ),
    resourceId: requireIdentifier(input.resourceId, "resourceId"),
    parentResourceType: input.parentResourceType
      ? requireToken(
          input.parentResourceType,
          "parentResourceType",
        )
      : null,
    parentResourceId: input.parentResourceId
      ? requireIdentifier(
          input.parentResourceId,
          "parentResourceId",
        )
      : null,
    correlationId: input.correlationId ?? randomUUID(),
    source: requireToken(input.source ?? "application", "source"),
    previousState: input.previousState ?? null,
    newState: input.newState ?? null,
    metadata: input.metadata ?? {},
  };
}

function requireToken(value: string, name: string): string {
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > 200 ||
    !/^[a-z0-9_.:-]+$/i.test(normalized)
  ) {
    throw new Error(`Invalid audit ${name}.`);
  }
  return normalized;
}

function requireIdentifier(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 500) {
    throw new Error(`Invalid audit ${name}.`);
  }
  return normalized;
}
