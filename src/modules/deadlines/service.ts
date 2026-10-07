import { and, desc, eq, isNull, max, or } from "drizzle-orm";
import type { Database, DatabaseTransaction } from "@/db/client";
import {
  auditEvents,
  caseDeadlineHistory,
  caseDeadlines,
  caseQueues,
  deadlineCalendarExclusions,
  deadlineCalendars,
} from "@/db/schema";
import type { TenantScope } from "@/lib/tenancy";
import { auditEventValues } from "@/modules/audit/event";
import { createNotificationForCaseAssigneeInTransaction } from "@/modules/notifications/service";
import { escalateCase } from "@/modules/routing/service";
import type {
  DeadlinePolicy,
  WorkflowDefinition,
} from "@/modules/workflows/definition";
import {
  calculateDeadline,
  extendForPause,
  normalizeWeekendDays,
  pauseExtensionMilliseconds,
  validateTimeZone,
  type DeadlineCalendarSpec,
} from "./calculator";

const calendarKeyPattern = /^[a-z][a-z0-9_-]*$/;
const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export class DeadlineNotFoundError extends Error {
  constructor() {
    super("Deadline was not found in the active organization.");
    this.name = "DeadlineNotFoundError";
  }
}

export class DeadlineStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeadlineStateError";
  }
}

export async function createDeadlineCalendar(
  db: Database,
  scope: TenantScope,
  input: {
    key: string;
    name: string;
    timeZone: string;
    weekendDays: readonly number[];
    actorUserId: string;
  },
) {
  const key = input.key.trim();
  const name = input.name.trim();
  const timeZone = validateTimeZone(input.timeZone);
  const weekendDays = normalizeWeekendDays(input.weekendDays);

  if (!calendarKeyPattern.test(key) || !name) {
    throw new Error("Deadline calendar name or key is invalid.");
  }

  const [calendar] = await db
    .insert(deadlineCalendars)
    .values({
      organizationId: scope.organizationId,
      key,
      name,
      timeZone,
      weekendDays,
      createdByUserId: input.actorUserId,
    })
    .returning();

  await db.insert(auditEvents).values(
    auditEventValues({
      organizationId: scope.organizationId,
      actorType: "user",
      actorUserId: input.actorUserId,
      action: "deadline.calendar_created",
      resourceType: "deadline_calendar",
      resourceId: calendar.id,
      newState: {
        key: calendar.key,
        timeZone: calendar.timeZone,
        weekendDays: calendar.weekendDays,
        status: calendar.status,
      },
    }),
  );

  return calendar;
}

export async function addDeadlineCalendarExclusion(
  db: Database,
  scope: TenantScope,
  input: {
    calendarId: string;
    localDate: string;
    label?: string | null;
    actorUserId: string;
  },
) {
  if (!localDatePattern.test(input.localDate)) {
    throw new Error("Calendar exclusion date must use YYYY-MM-DD.");
  }

  const [calendar] = await db
    .select()
    .from(deadlineCalendars)
    .where(
      and(
        eq(deadlineCalendars.id, input.calendarId),
        eq(deadlineCalendars.organizationId, scope.organizationId),
        eq(deadlineCalendars.status, "active"),
      ),
    )
    .limit(1);

  if (!calendar) throw new DeadlineNotFoundError();

  const [exclusion] = await db
    .insert(deadlineCalendarExclusions)
    .values({
      organizationId: scope.organizationId,
      calendarId: calendar.id,
      localDate: input.localDate,
      label: input.label?.trim() || null,
      createdByUserId: input.actorUserId,
    })
    .onConflictDoNothing()
    .returning();

  if (!exclusion) return null;

  await db.insert(auditEvents).values(
    auditEventValues({
      organizationId: scope.organizationId,
      actorType: "user",
      actorUserId: input.actorUserId,
      action: "deadline.calendar_exclusion_added",
      resourceType: "deadline_calendar_exclusion",
      resourceId: exclusion.id,
      parentResourceType: "deadline_calendar",
      parentResourceId: calendar.id,
      newState: {
        localDate: exclusion.localDate,
        label: exclusion.label,
      },
    }),
  );

  return exclusion;
}

export async function instantiateDeadlinesForCaseEvent(
  tx: DatabaseTransaction,
  scope: TenantScope,
  input: {
    caseId: string;
    workflow: WorkflowDefinition;
    trigger:
      | { type: "case_created" }
      | { type: "transition"; transitionKey: string };
    actorUserId?: string | null;
    startedAt: Date;
  },
) {
  const policies = input.workflow.deadlinePolicies.filter((policy) => {
    if (input.trigger.type === "case_created") {
      return policy.trigger.type === "case_created";
    }
    return (
      policy.trigger.type === "transition" &&
      policy.trigger.transitionKey === input.trigger.transitionKey
    );
  });

  const created = [];

  for (const policy of policies) {
    const [latest] = await tx
      .select()
      .from(caseDeadlines)
      .where(
        and(
          eq(caseDeadlines.organizationId, scope.organizationId),
          eq(caseDeadlines.caseId, input.caseId),
          isNull(caseDeadlines.referralId),
          eq(caseDeadlines.policyKey, policy.key),
        ),
      )
      .orderBy(desc(caseDeadlines.occurrence))
      .limit(1);

    if (
      latest &&
      (latest.status === "active" ||
        latest.status === "paused" ||
        latest.status === "overdue")
    ) {
      continue;
    }

    const calendar = await resolvePolicyCalendar(
      tx,
      scope,
      policy,
    );
    const calculated = calculateDeadline(
      input.startedAt,
      policy,
      calendar?.spec ?? null,
    );
    const occurrence = (latest?.occurrence ?? 0) + 1;

    const [deadline] = await tx
      .insert(caseDeadlines)
      .values({
        organizationId: scope.organizationId,
        caseId: input.caseId,
        policyKey: policy.key,
        occurrence,
        label: policy.label,
        description: policy.description ?? null,
        triggerType: policy.trigger.type,
        triggerKey:
          policy.trigger.type === "transition"
            ? policy.trigger.transitionKey
            : null,
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
        startedAt: input.startedAt,
        dueAt: calculated.dueAt,
        warningAt: calculated.warningAt,
      })
      .returning();

    await tx.insert(caseDeadlineHistory).values({
      organizationId: scope.organizationId,
      deadlineId: deadline.id,
      eventType: "started",
      actorUserId: input.actorUserId ?? null,
      metadata: {
        triggerType: input.trigger.type,
        triggerKey:
          input.trigger.type === "transition"
            ? input.trigger.transitionKey
            : null,
        dueAt: deadline.dueAt.toISOString(),
        warningAt: deadline.warningAt?.toISOString() ?? null,
      },
      occurredAt: input.startedAt,
    });

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: input.actorUserId ? "user" : "system",
        actorUserId: input.actorUserId ?? null,
        action: "deadline.started",
        resourceType: "case_deadline",
        resourceId: deadline.id,
        parentResourceType: "case",
        parentResourceId: input.caseId,
        newState: {
          policyKey: deadline.policyKey,
          occurrence: deadline.occurrence,
          status: deadline.status,
          dueAt: deadline.dueAt.toISOString(),
          warningAt: deadline.warningAt?.toISOString() ?? null,
        },
      }),
    );

    created.push(deadline);
  }

  return created;
}

export async function completeDeadlinesForTransition(
  tx: DatabaseTransaction,
  scope: TenantScope,
  input: {
    caseId: string;
    workflow: WorkflowDefinition;
    transitionKey: string;
    actorUserId: string;
    occurredAt: Date;
  },
) {
  const policyKeys = input.workflow.deadlinePolicies
    .filter((policy) =>
      policy.completeOnTransitions.includes(input.transitionKey),
    )
    .map((policy) => policy.key);

  if (policyKeys.length === 0) return [];

  const active = await tx
    .select()
    .from(caseDeadlines)
    .where(
      and(
        eq(caseDeadlines.organizationId, scope.organizationId),
        eq(caseDeadlines.caseId, input.caseId),
      ),
    );

  const matching = active.filter(
    (deadline) =>
      policyKeys.includes(deadline.policyKey) &&
      (deadline.status === "active" ||
        deadline.status === "paused" ||
        deadline.status === "overdue"),
  );

  const completed = [];
  for (const deadline of matching) {
    const [updated] = await tx
      .update(caseDeadlines)
      .set({
        status: "completed",
        completedAt: input.occurredAt,
        pausedAt: null,
        updatedAt: input.occurredAt,
      })
      .where(
        and(
          eq(caseDeadlines.id, deadline.id),
          eq(caseDeadlines.organizationId, scope.organizationId),
        ),
      )
      .returning();

    await tx.insert(caseDeadlineHistory).values({
      organizationId: scope.organizationId,
      deadlineId: deadline.id,
      eventType: "completed",
      actorUserId: input.actorUserId,
      metadata: { transitionKey: input.transitionKey },
      occurredAt: input.occurredAt,
    });

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId: input.actorUserId,
        action: "deadline.completed",
        resourceType: "case_deadline",
        resourceId: deadline.id,
        parentResourceType: "case",
        parentResourceId: input.caseId,
        previousState: { status: deadline.status },
        newState: { status: updated.status },
        metadata: { transitionKey: input.transitionKey },
      }),
    );

    completed.push(updated);
  }

  return completed;
}

export async function pauseDeadline(
  db: Database,
  scope: TenantScope,
  input: {
    deadlineId: string;
    actorUserId: string;
    reason: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  if (!input.reason.trim()) {
    throw new DeadlineStateError("Pause reason is required.");
  }

  return db.transaction(async (tx) => {
    const deadline = await requireDeadline(tx, scope, input.deadlineId);
    if (!deadline.pausable) {
      throw new DeadlineStateError("This deadline policy cannot be paused.");
    }
    if (deadline.status !== "active") {
      throw new DeadlineStateError("Only an active deadline can be paused.");
    }

    const [updated] = await tx
      .update(caseDeadlines)
      .set({
        status: "paused",
        pausedAt: now,
        updatedAt: now,
      })
      .where(eq(caseDeadlines.id, deadline.id))
      .returning();

    await recordDeadlineHistoryAndAudit(tx, scope, {
      deadline,
      updated,
      eventType: "paused",
      action: "deadline.paused",
      actorUserId: input.actorUserId,
      reason: input.reason.trim(),
      occurredAt: now,
    });

    return updated;
  });
}

export async function resumeDeadline(
  db: Database,
  scope: TenantScope,
  input: {
    deadlineId: string;
    actorUserId: string;
    reason: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  if (!input.reason.trim()) {
    throw new DeadlineStateError("Resume reason is required.");
  }

  return db.transaction(async (tx) => {
    const deadline = await requireDeadline(tx, scope, input.deadlineId);
    if (deadline.status !== "paused" || !deadline.pausedAt) {
      throw new DeadlineStateError("Only a paused deadline can be resumed.");
    }

    const calendar = await resolveDeadlineCalendar(
      tx,
      scope,
      deadline.calendarId,
    );
    const extension = pauseExtensionMilliseconds(
      deadline.pausedAt,
      now,
      deadline.durationUnit as
        | "hours"
        | "calendar_days"
        | "business_days",
      calendar?.spec ?? null,
    );

    const dueAt = extendForPause(
      deadline.dueAt,
      extension,
      deadline.durationUnit as
        | "hours"
        | "calendar_days"
        | "business_days",
      calendar?.spec ?? null,
    );

    const warningAt =
      deadline.warningAt && !deadline.warningIssuedAt
        ? extendForPause(
            deadline.warningAt,
            extension,
            deadline.durationUnit as
              | "hours"
              | "calendar_days"
              | "business_days",
            calendar?.spec ?? null,
          )
        : deadline.warningAt;

    const [updated] = await tx
      .update(caseDeadlines)
      .set({
        status: "active",
        pausedAt: null,
        dueAt,
        warningAt,
        accumulatedPauseSeconds:
          deadline.accumulatedPauseSeconds +
          Math.round(extension / 1000),
        updatedAt: now,
      })
      .where(eq(caseDeadlines.id, deadline.id))
      .returning();

    await recordDeadlineHistoryAndAudit(tx, scope, {
      deadline,
      updated,
      eventType: "resumed",
      action: "deadline.resumed",
      actorUserId: input.actorUserId,
      reason: input.reason.trim(),
      occurredAt: now,
      metadata: { extensionSeconds: Math.round(extension / 1000) },
    });

    return updated;
  });
}

export async function completeDeadline(
  db: Database,
  scope: TenantScope,
  input: {
    deadlineId: string;
    actorUserId: string;
    reason: string;
    now?: Date;
  },
) {
  return finishDeadline(db, scope, {
    ...input,
    status: "completed",
    eventType: "completed",
    action: "deadline.completed",
  });
}

export async function cancelDeadline(
  db: Database,
  scope: TenantScope,
  input: {
    deadlineId: string;
    actorUserId: string;
    reason: string;
    now?: Date;
  },
) {
  return finishDeadline(db, scope, {
    ...input,
    status: "cancelled",
    eventType: "cancelled",
    action: "deadline.cancelled",
  });
}

export async function sweepOrganizationDeadlines(
  db: Database,
  scope: TenantScope,
  now = new Date(),
) {
  const active = await db
    .select()
    .from(caseDeadlines)
    .where(
      and(
        eq(caseDeadlines.organizationId, scope.organizationId),
        eq(caseDeadlines.status, "active"),
      ),
    );

  let warnings = 0;
  let overdue = 0;

  for (const candidate of active) {
    await db.transaction(async (tx) => {
      const deadline = await requireDeadline(tx, scope, candidate.id);
      if (deadline.status !== "active") return;

      if (
        deadline.warningAt &&
        !deadline.warningIssuedAt &&
        now.getTime() >= deadline.warningAt.getTime()
      ) {
        const [warned] = await tx
          .update(caseDeadlines)
          .set({ warningIssuedAt: now, updatedAt: now })
          .where(
            and(
              eq(caseDeadlines.id, deadline.id),
              eq(
                caseDeadlines.organizationId,
                scope.organizationId,
              ),
              eq(caseDeadlines.status, "active"),
              isNull(caseDeadlines.warningIssuedAt),
            ),
          )
          .returning();

        if (warned) {
          await tx.insert(caseDeadlineHistory).values({
            organizationId: scope.organizationId,
            deadlineId: deadline.id,
            eventType: "warning",
            actorUserId: null,
            metadata: {},
            occurredAt: now,
          });

          await tx.insert(auditEvents).values(
            auditEventValues({
              organizationId: scope.organizationId,
              actorType: "system",
              action: "deadline.warning_reached",
              resourceType: "case_deadline",
              resourceId: deadline.id,
              parentResourceType: "case",
              parentResourceId: deadline.caseId,
              newState: { warningIssuedAt: now.toISOString() },
            }),
          );

          await createNotificationForCaseAssigneeInTransaction(
            tx,
            scope,
            deadline.caseId,
            {
              eventType: "deadline.warning",
              severity: "warning",
              title: `Deadline approaching: ${deadline.label}`,
              body: `The deadline is due at ${deadline.dueAt.toISOString()}.`,
            },
          );
          warnings += 1;
        }
      }

      if (now.getTime() >= deadline.dueAt.getTime()) {
        const [updated] = await tx
          .update(caseDeadlines)
          .set({
            status: "overdue",
            overdueAt: deadline.overdueAt ?? now,
            updatedAt: now,
          })
          .where(
            and(
              eq(caseDeadlines.id, deadline.id),
              eq(
                caseDeadlines.organizationId,
                scope.organizationId,
              ),
              eq(caseDeadlines.status, "active"),
            ),
          )
          .returning();

        if (updated) {
          await tx.insert(caseDeadlineHistory).values({
            organizationId: scope.organizationId,
            deadlineId: deadline.id,
            eventType: "overdue",
            actorUserId: null,
            metadata: {},
            occurredAt: now,
          });

          await tx.insert(auditEvents).values(
            auditEventValues({
              organizationId: scope.organizationId,
              actorType: "system",
              action: "deadline.overdue",
              resourceType: "case_deadline",
              resourceId: deadline.id,
              parentResourceType: "case",
              parentResourceId: deadline.caseId,
              previousState: { status: deadline.status },
              newState: {
                status: updated.status,
                overdueAt:
                  updated.overdueAt?.toISOString() ?? null,
              },
            }),
          );

          await createNotificationForCaseAssigneeInTransaction(
            tx,
            scope,
            deadline.caseId,
            {
              eventType: "deadline.overdue",
              severity: "critical",
              title: `Deadline overdue: ${deadline.label}`,
              body: `The deadline was due at ${deadline.dueAt.toISOString()}.`,
            },
          );
          overdue += 1;
        }
      }
    });
  }

  const overdueForEscalation = await db
    .select()
    .from(caseDeadlines)
    .where(
      and(
        eq(caseDeadlines.organizationId, scope.organizationId),
        eq(caseDeadlines.status, "overdue"),
      ),
    );

  let escalated = 0;
  let escalationFailures = 0;

  for (const deadline of overdueForEscalation) {
    if (
      deadline.escalatedAt ||
      (!deadline.escalationPriority && !deadline.escalationQueueSlug)
    ) {
      continue;
    }

    try {
      let targetQueueId: string | null = null;
      if (deadline.escalationQueueSlug) {
        const [queue] = await db
          .select({ id: caseQueues.id })
          .from(caseQueues)
          .where(
            and(
              eq(caseQueues.organizationId, scope.organizationId),
              eq(caseQueues.slug, deadline.escalationQueueSlug),
              eq(caseQueues.status, "active"),
            ),
          )
          .limit(1);

        if (!queue) {
          throw new Error("Configured escalation queue is unavailable.");
        }
        targetQueueId = queue.id;
      }

      await escalateCase(db, scope, {
        caseId: deadline.caseId,
        actorUserId: null,
        reason: `Deadline ${deadline.policyKey} is overdue.`,
        targetQueueId,
        priority: deadline.escalationPriority
          ? (deadline.escalationPriority as
              | "low"
              | "normal"
              | "high"
              | "critical")
          : undefined,
      });

      await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(caseDeadlines)
          .set({
            escalatedAt: now,
            escalationAttempts: deadline.escalationAttempts + 1,
            lastEscalationError: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(caseDeadlines.id, deadline.id),
              eq(caseDeadlines.organizationId, scope.organizationId),
            ),
          )
          .returning();

        await tx.insert(caseDeadlineHistory).values({
          organizationId: scope.organizationId,
          deadlineId: deadline.id,
          eventType: "escalated",
          actorUserId: null,
          metadata: {
            priority: deadline.escalationPriority,
            queueSlug: deadline.escalationQueueSlug,
          },
          occurredAt: now,
        });

        await tx.insert(auditEvents).values(
          auditEventValues({
            organizationId: scope.organizationId,
            actorType: "system",
            action: "deadline.escalation_applied",
            resourceType: "case_deadline",
            resourceId: deadline.id,
            parentResourceType: "case",
            parentResourceId: deadline.caseId,
            newState: {
              escalatedAt: updated.escalatedAt?.toISOString() ?? null,
            },
            metadata: {
              priority: deadline.escalationPriority,
              queueSlug: deadline.escalationQueueSlug,
            },
          }),
        );
      });

      escalated += 1;
    } catch {
      await db
        .update(caseDeadlines)
        .set({
          escalationAttempts: deadline.escalationAttempts + 1,
          lastEscalationError:
            "Configured deadline escalation could not be applied.",
          updatedAt: now,
        })
        .where(
          and(
            eq(caseDeadlines.id, deadline.id),
            eq(caseDeadlines.organizationId, scope.organizationId),
          ),
        );
      escalationFailures += 1;
    }
  }

  return { warnings, overdue, escalated, escalationFailures };
}

async function finishDeadline(
  db: Database,
  scope: TenantScope,
  input: {
    deadlineId: string;
    actorUserId: string;
    reason: string;
    now?: Date;
    status: "completed" | "cancelled";
    eventType: "completed" | "cancelled";
    action: "deadline.completed" | "deadline.cancelled";
  },
) {
  const now = input.now ?? new Date();
  if (!input.reason.trim()) {
    throw new DeadlineStateError("A completion/cancellation reason is required.");
  }

  return db.transaction(async (tx) => {
    const deadline = await requireDeadline(tx, scope, input.deadlineId);
    if (
      deadline.status !== "active" &&
      deadline.status !== "paused" &&
      deadline.status !== "overdue"
    ) {
      throw new DeadlineStateError("Deadline is already final.");
    }

    const [updated] = await tx
      .update(caseDeadlines)
      .set({
        status: input.status,
        completedAt: input.status === "completed" ? now : deadline.completedAt,
        cancelledAt: input.status === "cancelled" ? now : deadline.cancelledAt,
        pausedAt: null,
        updatedAt: now,
      })
      .where(eq(caseDeadlines.id, deadline.id))
      .returning();

    await recordDeadlineHistoryAndAudit(tx, scope, {
      deadline,
      updated,
      eventType: input.eventType,
      action: input.action,
      actorUserId: input.actorUserId,
      reason: input.reason.trim(),
      occurredAt: now,
    });

    return updated;
  });
}

async function requireDeadline(
  tx: DatabaseTransaction,
  scope: TenantScope,
  deadlineId: string,
) {
  const [deadline] = await tx
    .select()
    .from(caseDeadlines)
    .where(
      and(
        eq(caseDeadlines.id, deadlineId),
        eq(caseDeadlines.organizationId, scope.organizationId),
      ),
    )
    .limit(1);

  if (!deadline) throw new DeadlineNotFoundError();
  return deadline;
}

async function resolvePolicyCalendar(
  tx: DatabaseTransaction,
  scope: TenantScope,
  policy: DeadlinePolicy,
) {
  const needsCalendar =
    policy.duration.unit === "business_days" ||
    policy.warningBefore?.unit === "business_days";

  if (!policy.calendarKey) {
    if (needsCalendar) {
      throw new Error(
        "Business-day deadline policy is missing calendarKey.",
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
      `Deadline calendar ${policy.calendarKey} is unavailable.`,
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

async function resolveDeadlineCalendar(
  tx: DatabaseTransaction,
  scope: TenantScope,
  calendarId: string | null,
) {
  if (!calendarId) return null;

  const [calendar] = await tx
    .select()
    .from(deadlineCalendars)
    .where(
      and(
        eq(deadlineCalendars.organizationId, scope.organizationId),
        eq(deadlineCalendars.id, calendarId),
        eq(deadlineCalendars.status, "active"),
      ),
    )
    .limit(1);

  if (!calendar) {
    throw new Error("Deadline calendar is unavailable.");
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

async function recordDeadlineHistoryAndAudit(
  tx: DatabaseTransaction,
  scope: TenantScope,
  input: {
    deadline: typeof caseDeadlines.$inferSelect;
    updated: typeof caseDeadlines.$inferSelect;
    eventType: string;
    action: string;
    actorUserId: string;
    reason?: string | null;
    occurredAt: Date;
    metadata?: Record<string, unknown>;
  },
) {
  await tx.insert(caseDeadlineHistory).values({
    organizationId: scope.organizationId,
    deadlineId: input.deadline.id,
    eventType: input.eventType,
    actorUserId: input.actorUserId,
    reason: input.reason ?? null,
    metadata: input.metadata ?? {},
    occurredAt: input.occurredAt,
  });

  await tx.insert(auditEvents).values(
    auditEventValues({
      organizationId: scope.organizationId,
      actorType: "user",
      actorUserId: input.actorUserId,
      action: input.action,
      resourceType: "case_deadline",
      resourceId: input.deadline.id,
      parentResourceType: "case",
      parentResourceId: input.deadline.caseId,
      previousState: {
        status: input.deadline.status,
        dueAt: input.deadline.dueAt.toISOString(),
        warningAt: input.deadline.warningAt?.toISOString() ?? null,
      },
      newState: {
        status: input.updated.status,
        dueAt: input.updated.dueAt.toISOString(),
        warningAt: input.updated.warningAt?.toISOString() ?? null,
      },
      metadata: input.metadata ?? {},
      occurredAt: input.occurredAt,
    }),
  );
}
