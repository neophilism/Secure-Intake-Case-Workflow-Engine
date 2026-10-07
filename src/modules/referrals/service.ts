import { and, desc, eq } from "drizzle-orm";
import type {
  Database,
  DatabaseTransaction,
} from "@/db/client";
import {
  auditEvents,
  caseDeadlineHistory,
  caseDeadlines,
  caseReferralEvents,
  caseReferralPolicies,
  caseReferrals,
  cases,
  deadlineCalendarExclusions,
  deadlineCalendars,
} from "@/db/schema";
import type { TenantScope } from "@/lib/tenancy";
import { auditEventValues } from "@/modules/audit/event";
import {
  addDuration,
  subtractDuration,
  type DeadlineCalendarSpec,
} from "@/modules/deadlines/calculator";
import {
  parseReferralPolicyDefinition,
  referralDeadlinePolicySchema,
  type ReferralDeadlinePolicy,
  type ReferralEventType,
} from "./definition";

export class ReferralNotFoundError extends Error {
  constructor() {
    super("Referral was not found in the active organization.");
    this.name = "ReferralNotFoundError";
  }
}

export class ReferralStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReferralStateError";
  }
}

function cleanRequired(value: string, label: string, max = 500) {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) {
    throw new Error(`${label} is required and must not exceed ${max} characters.`);
  }
  return normalized;
}

function cleanOptional(value: string | null | undefined, max: number) {
  const normalized = value?.trim() || null;
  if (normalized && normalized.length > max) {
    throw new Error(`Value must not exceed ${max} characters.`);
  }
  return normalized;
}

export async function createCaseReferral(
  db: Database,
  scope: TenantScope,
  input: {
    caseId: string;
    policyKey: string;
    recipientKey?: string | null;
    recipientName: string;
    externalReference?: string | null;
    subject?: string | null;
    summary?: string | null;
    actorUserId: string;
  },
) {
  const policyKey = cleanRequired(input.policyKey, "Referral policy key", 100);
  const recipientName = cleanRequired(
    input.recipientName,
    "Referral recipient",
    500,
  );

  return db.transaction(async (tx) => {
    const [[caseRecord], [policy]] = await Promise.all([
      tx
        .select({ id: cases.id })
        .from(cases)
        .where(
          and(
            eq(cases.id, input.caseId),
            eq(cases.organizationId, scope.organizationId),
          ),
        )
        .limit(1),
      tx
        .select()
        .from(caseReferralPolicies)
        .where(
          and(
            eq(
              caseReferralPolicies.organizationId,
              scope.organizationId,
            ),
            eq(caseReferralPolicies.key, policyKey),
            eq(caseReferralPolicies.status, "active"),
          ),
        )
        .limit(1),
    ]);

    if (!caseRecord || !policy) throw new ReferralNotFoundError();

    const definition = parseReferralPolicyDefinition(policy.definition);
    const [referral] = await tx
      .insert(caseReferrals)
      .values({
        organizationId: scope.organizationId,
        caseId: caseRecord.id,
        policyId: policy.id,
        policyKey: policy.key,
        policySnapshot: JSON.parse(JSON.stringify(definition)),
        recipientKey: cleanOptional(input.recipientKey, 200),
        recipientName,
        externalReference: cleanOptional(input.externalReference, 500),
        subject: cleanOptional(input.subject, 1000),
        summary: cleanOptional(input.summary, 10_000),
        status: "draft",
        createdByUserId: input.actorUserId,
        updatedByUserId: input.actorUserId,
      })
      .returning();

    await recordReferralEvent(tx, scope, {
      referral,
      eventType: "created",
      actorUserId: input.actorUserId,
      summary: "Referral created.",
    });

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId: input.actorUserId,
        action: "referral.created",
        resourceType: "case_referral",
        resourceId: referral.id,
        parentResourceType: "case",
        parentResourceId: referral.caseId,
        newState: {
          status: referral.status,
          policyKey: referral.policyKey,
        },
        metadata: {
          recipientKey: referral.recipientKey,
          recipientName: referral.recipientName,
        },
      }),
    );

    return referral;
  });
}

export async function sendCaseReferral(
  db: Database,
  scope: TenantScope,
  input: {
    referralId: string;
    actorUserId: string;
    note?: string | null;
    sentAt?: Date;
  },
) {
  const occurredAt = input.sentAt ?? new Date();

  return db.transaction(async (tx) => {
    const referral = await requireReferral(tx, scope, input.referralId);
    if (referral.status !== "draft") {
      throw new ReferralStateError("Only a draft referral can be sent.");
    }

    const [updated] = await tx
      .update(caseReferrals)
      .set({
        status: "sent",
        sentAt: occurredAt,
        updatedByUserId: input.actorUserId,
        updatedAt: occurredAt,
      })
      .where(eq(caseReferrals.id, referral.id))
      .returning();

    await recordReferralEvent(tx, scope, {
      referral: updated,
      eventType: "sent",
      actorUserId: input.actorUserId,
      summary: cleanOptional(input.note, 10_000) ?? "Referral sent.",
      occurredAt,
    });
    await completeDeadlinesForReferralEvent(
      tx,
      scope,
      updated,
      "sent",
      input.actorUserId,
      occurredAt,
    );
    await instantiateReferralDeadlines(
      tx,
      scope,
      updated,
      "sent",
      input.actorUserId,
      occurredAt,
    );
    await recordReferralAudit(tx, scope, referral, updated, {
      action: "referral.sent",
      actorUserId: input.actorUserId,
      occurredAt,
    });

    return updated;
  });
}

export async function acknowledgeCaseReferral(
  db: Database,
  scope: TenantScope,
  input: {
    referralId: string;
    actorUserId: string;
    summary?: string | null;
    externalReference?: string | null;
    occurredAt?: Date;
  },
) {
  const occurredAt = input.occurredAt ?? new Date();

  return db.transaction(async (tx) => {
    const referral = await requireReferral(tx, scope, input.referralId);
    if (
      referral.status === "draft" ||
      referral.status === "completed" ||
      referral.status === "cancelled"
    ) {
      throw new ReferralStateError(
        "Referral must be sent and non-final before acknowledgment.",
      );
    }

    const [updated] = await tx
      .update(caseReferrals)
      .set({
        status: "acknowledged",
        acknowledgedAt: referral.acknowledgedAt ?? occurredAt,
        externalReference:
          cleanOptional(input.externalReference, 500) ??
          referral.externalReference,
        updatedByUserId: input.actorUserId,
        updatedAt: occurredAt,
      })
      .where(eq(caseReferrals.id, referral.id))
      .returning();

    await recordReferralEvent(tx, scope, {
      referral: updated,
      eventType: "acknowledged",
      actorUserId: input.actorUserId,
      summary:
        cleanOptional(input.summary, 10_000) ?? "Referral acknowledged.",
      details: {
        externalReference: updated.externalReference,
      },
      occurredAt,
    });
    await completeDeadlinesForReferralEvent(
      tx,
      scope,
      updated,
      "acknowledged",
      input.actorUserId,
      occurredAt,
    );
    await instantiateReferralDeadlines(
      tx,
      scope,
      updated,
      "acknowledged",
      input.actorUserId,
      occurredAt,
    );
    await recordReferralAudit(tx, scope, referral, updated, {
      action: "referral.acknowledged",
      actorUserId: input.actorUserId,
      occurredAt,
    });

    return updated;
  });
}

export async function recordCaseReferralResponse(
  db: Database,
  scope: TenantScope,
  input: {
    referralId: string;
    responseType:
      | "preliminary_response"
      | "status_update"
      | "final_response";
    summary: string;
    details?: Record<string, unknown>;
    actorUserId: string;
    occurredAt?: Date;
  },
) {
  const occurredAt = input.occurredAt ?? new Date();
  const summary = cleanRequired(input.summary, "Response summary", 10_000);

  return db.transaction(async (tx) => {
    const referral = await requireReferral(tx, scope, input.referralId);
    if (
      referral.status === "draft" ||
      referral.status === "completed" ||
      referral.status === "cancelled"
    ) {
      throw new ReferralStateError(
        "Responses can be recorded only for an active sent referral.",
      );
    }

    const final = input.responseType === "final_response";
    const [updated] = await tx
      .update(caseReferrals)
      .set({
        status: final ? "completed" : "active",
        acknowledgedAt: referral.acknowledgedAt ?? occurredAt,
        completedAt: final ? occurredAt : referral.completedAt,
        updatedByUserId: input.actorUserId,
        updatedAt: occurredAt,
      })
      .where(eq(caseReferrals.id, referral.id))
      .returning();

    await recordReferralEvent(tx, scope, {
      referral: updated,
      eventType: input.responseType,
      actorUserId: input.actorUserId,
      summary,
      details: input.details ?? {},
      occurredAt,
    });
    await completeDeadlinesForReferralEvent(
      tx,
      scope,
      updated,
      input.responseType,
      input.actorUserId,
      occurredAt,
    );
    await recordReferralAudit(tx, scope, referral, updated, {
      action: final
        ? "referral.final_response_recorded"
        : "referral.response_recorded",
      actorUserId: input.actorUserId,
      occurredAt,
      metadata: { responseType: input.responseType },
    });

    return updated;
  });
}

export async function completeCaseReferral(
  db: Database,
  scope: TenantScope,
  input: {
    referralId: string;
    actorUserId: string;
    reason: string;
    occurredAt?: Date;
  },
) {
  return finishCaseReferral(db, scope, {
    ...input,
    eventType: "completed",
    status: "completed",
    action: "referral.completed",
  });
}

export async function cancelCaseReferral(
  db: Database,
  scope: TenantScope,
  input: {
    referralId: string;
    actorUserId: string;
    reason: string;
    occurredAt?: Date;
  },
) {
  return finishCaseReferral(db, scope, {
    ...input,
    eventType: "cancelled",
    status: "cancelled",
    action: "referral.cancelled",
  });
}

async function finishCaseReferral(
  db: Database,
  scope: TenantScope,
  input: {
    referralId: string;
    actorUserId: string;
    reason: string;
    occurredAt?: Date;
    eventType: "completed" | "cancelled";
    status: "completed" | "cancelled";
    action: "referral.completed" | "referral.cancelled";
  },
) {
  const occurredAt = input.occurredAt ?? new Date();
  const reason = cleanRequired(input.reason, "Referral finalization reason", 10_000);

  return db.transaction(async (tx) => {
    const referral = await requireReferral(tx, scope, input.referralId);
    if (referral.status === "completed" || referral.status === "cancelled") {
      throw new ReferralStateError("Referral is already final.");
    }

    const [updated] = await tx
      .update(caseReferrals)
      .set({
        status: input.status,
        completedAt:
          input.status === "completed" ? occurredAt : referral.completedAt,
        cancelledAt:
          input.status === "cancelled" ? occurredAt : referral.cancelledAt,
        updatedByUserId: input.actorUserId,
        updatedAt: occurredAt,
      })
      .where(eq(caseReferrals.id, referral.id))
      .returning();

    await recordReferralEvent(tx, scope, {
      referral: updated,
      eventType: input.eventType,
      actorUserId: input.actorUserId,
      summary: reason,
      occurredAt,
    });
    await completeDeadlinesForReferralEvent(
      tx,
      scope,
      updated,
      input.eventType,
      input.actorUserId,
      occurredAt,
    );
    await recordReferralAudit(tx, scope, referral, updated, {
      action: input.action,
      actorUserId: input.actorUserId,
      occurredAt,
    });
    return updated;
  });
}

async function instantiateReferralDeadlines(
  tx: DatabaseTransaction,
  scope: TenantScope,
  referral: typeof caseReferrals.$inferSelect,
  trigger: "sent" | "acknowledged",
  actorUserId: string,
  startedAt: Date,
) {
  const definition = parseReferralPolicyDefinition(referral.policySnapshot);
  const policies = definition.deadlinePolicies.filter(
    (policy) => policy.trigger === trigger,
  );

  for (const policy of policies) {
    const [latest] = await tx
      .select()
      .from(caseDeadlines)
      .where(
        and(
          eq(caseDeadlines.organizationId, scope.organizationId),
          eq(caseDeadlines.referralId, referral.id),
          eq(caseDeadlines.policyKey, policy.key),
        ),
      )
      .orderBy(desc(caseDeadlines.occurrence))
      .limit(1);

    if (
      latest &&
      ["active", "paused", "overdue"].includes(latest.status)
    ) {
      continue;
    }

    const calendar = await resolveReferralCalendar(tx, scope, policy);
    const dueAt = addDuration(
      startedAt,
      policy.duration.value,
      policy.duration.unit,
      calendar?.spec ?? null,
    );
    const warningAt = policy.warningBefore
      ? subtractDuration(
          dueAt,
          policy.warningBefore.value,
          policy.warningBefore.unit,
          calendar?.spec ?? null,
        )
      : null;
    const occurrence = (latest?.occurrence ?? 0) + 1;

    const [deadline] = await tx
      .insert(caseDeadlines)
      .values({
        organizationId: scope.organizationId,
        caseId: referral.caseId,
        referralId: referral.id,
        policyKey: policy.key,
        occurrence,
        label: policy.label,
        description: policy.description ?? null,
        triggerType: "referral_event",
        triggerKey: trigger,
        durationValue: policy.duration.value,
        durationUnit: policy.duration.unit,
        calendarId: calendar?.id ?? null,
        warningBeforeValue: policy.warningBefore?.value ?? null,
        warningBeforeUnit: policy.warningBefore?.unit ?? null,
        pausable: policy.pausable,
        escalationPriority: policy.escalation?.priority ?? null,
        escalationQueueSlug: policy.escalation?.queueSlug ?? null,
        policySnapshot: JSON.parse(JSON.stringify(policy)),
        status: "active",
        startedAt,
        dueAt,
        warningAt:
          warningAt && warningAt.getTime() < startedAt.getTime()
            ? new Date(startedAt)
            : warningAt,
      })
      .returning();

    await tx.insert(caseDeadlineHistory).values({
      organizationId: scope.organizationId,
      deadlineId: deadline.id,
      eventType: "started",
      actorUserId,
      metadata: {
        referralId: referral.id,
        recipientName: referral.recipientName,
        triggerType: "referral_event",
        triggerKey: trigger,
        dueAt: deadline.dueAt.toISOString(),
        warningAt: deadline.warningAt?.toISOString() ?? null,
      },
      occurredAt: startedAt,
    });

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId,
        action: "deadline.started",
        resourceType: "case_deadline",
        resourceId: deadline.id,
        parentResourceType: "case_referral",
        parentResourceId: referral.id,
        newState: {
          policyKey: deadline.policyKey,
          occurrence: deadline.occurrence,
          status: deadline.status,
          dueAt: deadline.dueAt.toISOString(),
          warningAt: deadline.warningAt?.toISOString() ?? null,
        },
        metadata: {
          caseId: referral.caseId,
          recipientName: referral.recipientName,
        },
      }),
    );
  }
}

async function completeDeadlinesForReferralEvent(
  tx: DatabaseTransaction,
  scope: TenantScope,
  referral: typeof caseReferrals.$inferSelect,
  eventType: ReferralEventType,
  actorUserId: string,
  occurredAt: Date,
) {
  const active = await tx
    .select()
    .from(caseDeadlines)
    .where(
      and(
        eq(caseDeadlines.organizationId, scope.organizationId),
        eq(caseDeadlines.referralId, referral.id),
      ),
    );

  for (const deadline of active) {
    if (
      !["active", "paused", "overdue"].includes(deadline.status)
    ) {
      continue;
    }

    const policy = referralDeadlinePolicySchema.parse(
      deadline.policySnapshot,
    );
    if (!policy.completeOnEvents.includes(eventType)) continue;

    const [updated] = await tx
      .update(caseDeadlines)
      .set({
        status:
          eventType === "cancelled" ? "cancelled" : "completed",
        completedAt:
          eventType === "cancelled" ? deadline.completedAt : occurredAt,
        cancelledAt:
          eventType === "cancelled" ? occurredAt : deadline.cancelledAt,
        pausedAt: null,
        updatedAt: occurredAt,
      })
      .where(eq(caseDeadlines.id, deadline.id))
      .returning();

    await tx.insert(caseDeadlineHistory).values({
      organizationId: scope.organizationId,
      deadlineId: deadline.id,
      eventType:
        eventType === "cancelled" ? "cancelled" : "completed",
      actorUserId,
      reason: `Referral event: ${eventType}`,
      metadata: {
        referralId: referral.id,
        referralEventType: eventType,
      },
      occurredAt,
    });

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId,
        action:
          eventType === "cancelled"
            ? "deadline.cancelled"
            : "deadline.completed",
        resourceType: "case_deadline",
        resourceId: deadline.id,
        parentResourceType: "case_referral",
        parentResourceId: referral.id,
        previousState: { status: deadline.status },
        newState: { status: updated.status },
        metadata: {
          caseId: referral.caseId,
          referralEventType: eventType,
        },
        occurredAt,
      }),
    );
  }
}

async function resolveReferralCalendar(
  tx: DatabaseTransaction,
  scope: TenantScope,
  policy: ReferralDeadlinePolicy,
) {
  const needsCalendar =
    policy.duration.unit === "business_days" ||
    policy.warningBefore?.unit === "business_days";

  if (!policy.calendarKey) {
    if (needsCalendar) {
      throw new Error(
        "Business-day referral deadline policy is missing calendarKey.",
      );
    }
    return null;
  }

  const [calendar] = await tx
    .select()
    .from(deadlineCalendars)
    .where(
      and(
        eq(deadlineCalendars.organizationId, scope.organizationId),
        eq(deadlineCalendars.key, policy.calendarKey),
        eq(deadlineCalendars.status, "active"),
      ),
    )
    .limit(1);
  if (!calendar) {
    throw new Error(
      `Referral deadline calendar ${policy.calendarKey} is unavailable.`,
    );
  }

  const exclusions = await tx
    .select({ localDate: deadlineCalendarExclusions.localDate })
    .from(deadlineCalendarExclusions)
    .where(
      and(
        eq(
          deadlineCalendarExclusions.organizationId,
          scope.organizationId,
        ),
        eq(deadlineCalendarExclusions.calendarId, calendar.id),
      ),
    );

  return {
    id: calendar.id,
    spec: {
      timeZone: calendar.timeZone,
      weekendDays: calendar.weekendDays,
      excludedLocalDates: new Set(exclusions.map((row) => row.localDate)),
    } satisfies DeadlineCalendarSpec,
  };
}

async function requireReferral(
  tx: DatabaseTransaction,
  scope: TenantScope,
  referralId: string,
) {
  const [referral] = await tx
    .select()
    .from(caseReferrals)
    .where(
      and(
        eq(caseReferrals.id, referralId),
        eq(caseReferrals.organizationId, scope.organizationId),
      ),
    )
    .limit(1);
  if (!referral) throw new ReferralNotFoundError();
  return referral;
}

async function recordReferralEvent(
  tx: DatabaseTransaction,
  scope: TenantScope,
  input: {
    referral: typeof caseReferrals.$inferSelect;
    eventType: ReferralEventType | "created";
    actorUserId: string;
    summary?: string | null;
    details?: Record<string, unknown>;
    occurredAt?: Date;
  },
) {
  await tx.insert(caseReferralEvents).values({
    organizationId: scope.organizationId,
    referralId: input.referral.id,
    eventType: input.eventType,
    summary: input.summary ?? null,
    details: input.details ?? {},
    actorUserId: input.actorUserId,
    occurredAt: input.occurredAt ?? new Date(),
  });
}

async function recordReferralAudit(
  tx: DatabaseTransaction,
  scope: TenantScope,
  previous: typeof caseReferrals.$inferSelect,
  updated: typeof caseReferrals.$inferSelect,
  input: {
    action: string;
    actorUserId: string;
    occurredAt: Date;
    metadata?: Record<string, unknown>;
  },
) {
  await tx.insert(auditEvents).values(
    auditEventValues({
      organizationId: scope.organizationId,
      actorType: "user",
      actorUserId: input.actorUserId,
      action: input.action,
      resourceType: "case_referral",
      resourceId: updated.id,
      parentResourceType: "case",
      parentResourceId: updated.caseId,
      previousState: { status: previous.status },
      newState: { status: updated.status },
      metadata: {
        recipientKey: updated.recipientKey,
        recipientName: updated.recipientName,
        ...(input.metadata ?? {}),
      },
      occurredAt: input.occurredAt,
    }),
  );
}

