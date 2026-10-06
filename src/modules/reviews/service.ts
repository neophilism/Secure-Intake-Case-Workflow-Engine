import {
  and,
  desc,
  eq,
  inArray,
  isNull,
} from "drizzle-orm";
import type {
  Database,
  DatabaseTransaction,
} from "@/db/client";
import {
  auditEvents,
  caseReviewHistory,
  caseReviews,
  cases,
  caseStatusHistory,
  deadlineCalendarExclusions,
  deadlineCalendars,
  membershipRoles,
  organizationMemberships,
  rolePermissions,
  reviewPolicies,
  reviewPolicyPrerequisites,
  users,
} from "@/db/schema";
import type { TenantScope } from "@/lib/tenancy";
import { auditEventValues } from "@/modules/audit/event";
import {
  addDuration,
  subtractDuration,
  type DeadlineCalendarSpec,
} from "@/modules/deadlines/calculator";
import {
  createNotificationForMembershipInTransaction,
  createNotificationForUserInTransaction,
} from "@/modules/notifications/service";
import {
  findWorkflowState,
  parseWorkflowDefinition,
} from "@/modules/workflows/definition";
import {
  parseReviewPolicyInput,
  parseReviewPolicySnapshot,
  type ReviewDurationUnit,
  type ReviewPolicyInput,
  type ReviewPolicySnapshot,
} from "./policy";

export class ReviewNotFoundError extends Error {
  constructor(message = "Review was not found in the active organization.") {
    super(message);
    this.name = "ReviewNotFoundError";
  }
}

export class ReviewStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewStateError";
  }
}

export class ReviewEligibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewEligibilityError";
  }
}

export class ReviewConcurrencyError extends Error {
  constructor() {
    super("The review or case changed before the operation completed.");
    this.name = "ReviewConcurrencyError";
  }
}

export async function createReviewPolicy(
  db: Database,
  scope: TenantScope,
  input: ReviewPolicyInput & { actorUserId: string },
) {
  const parsed = parseReviewPolicyInput(input);

  return db.transaction(async (tx) => {
    const calendar = await resolveReviewCalendar(
      tx,
      scope,
      parsed.calendarId ?? null,
      policyNeedsCalendar(parsed),
    );

    const prerequisites =
      parsed.prerequisitePolicyIds.length > 0
        ? await tx
            .select()
            .from(reviewPolicies)
            .where(
              and(
                eq(
                  reviewPolicies.organizationId,
                  scope.organizationId,
                ),
                inArray(
                  reviewPolicies.id,
                  parsed.prerequisitePolicyIds,
                ),
              ),
            )
        : [];

    if (
      prerequisites.length !==
      parsed.prerequisitePolicyIds.length
    ) {
      throw new ReviewEligibilityError(
        "One or more prerequisite review policies are unavailable.",
      );
    }

    if (
      prerequisites.some(
        (prerequisite) => prerequisite.level >= parsed.level,
      )
    ) {
      throw new ReviewEligibilityError(
        "Prerequisite review policies must be lower level than the new policy.",
      );
    }

    const [policy] = await tx
      .insert(reviewPolicies)
      .values({
        organizationId: scope.organizationId,
        key: parsed.key,
        name: parsed.name.trim(),
        description: parsed.description?.trim() || null,
        level: parsed.level,
        eligibleCaseStatuses: parsed.eligibleCaseStatuses,
        filingWindowValue: parsed.filingWindow?.value ?? null,
        filingWindowUnit: parsed.filingWindow?.unit ?? null,
        decisionDeadlineValue:
          parsed.decisionDeadline?.value ?? null,
        decisionDeadlineUnit:
          parsed.decisionDeadline?.unit ?? null,
        decisionWarningBeforeValue:
          parsed.decisionDeadline?.warningBefore?.value ?? null,
        decisionWarningBeforeUnit:
          parsed.decisionDeadline?.warningBefore?.unit ?? null,
        calendarId: calendar?.id ?? null,
        allowedOutcomes: parsed.allowedOutcomes,
        requireIndependentReviewer:
          parsed.requireIndependentReviewer,
        createdByUserId: input.actorUserId,
      })
      .returning();

    if (prerequisites.length > 0) {
      await tx.insert(reviewPolicyPrerequisites).values(
        prerequisites.map((prerequisite) => ({
          organizationId: scope.organizationId,
          policyId: policy.id,
          prerequisitePolicyId: prerequisite.id,
        })),
      );
    }

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId: input.actorUserId,
        action: "review.policy_created",
        resourceType: "review_policy",
        resourceId: policy.id,
        newState: {
          key: policy.key,
          level: policy.level,
          status: policy.status,
          prerequisitePolicyIds: prerequisites.map(
            (entry) => entry.id,
          ),
          allowedOutcomes: policy.allowedOutcomes,
          requireIndependentReviewer:
            policy.requireIndependentReviewer,
        },
      }),
    );

    return policy;
  });
}

export async function setReviewPolicyStatus(
  db: Database,
  scope: TenantScope,
  input: {
    policyId: string;
    status: "active" | "inactive";
    actorUserId: string;
  },
) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(reviewPolicies)
      .where(
        and(
          eq(reviewPolicies.id, input.policyId),
          eq(
            reviewPolicies.organizationId,
            scope.organizationId,
          ),
        ),
      )
      .limit(1);

    if (!current) {
      throw new ReviewNotFoundError("Review policy was not found.");
    }

    const [updated] = await tx
      .update(reviewPolicies)
      .set({
        status: input.status,
        updatedAt: new Date(),
      })
      .where(eq(reviewPolicies.id, current.id))
      .returning();

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId: input.actorUserId,
        action: "review.policy_status_changed",
        resourceType: "review_policy",
        resourceId: current.id,
        previousState: { status: current.status },
        newState: { status: updated.status },
      }),
    );

    return updated;
  });
}

export async function fileCaseReview(
  db: Database,
  scope: TenantScope,
  input: {
    caseId: string;
    policyId: string;
    parentReviewId?: string | null;
    grounds: string;
    requestedRelief?: string | null;
    actorUserId: string;
    filedAt?: Date;
  },
) {
  const grounds = input.grounds.trim();
  if (!grounds) {
    throw new ReviewEligibilityError("Review grounds are required.");
  }

  const filedAt = input.filedAt ?? new Date();

  return db.transaction(async (tx) => {
    const [caseRecord] = await tx
      .select()
      .from(cases)
      .where(
        and(
          eq(cases.id, input.caseId),
          eq(cases.organizationId, scope.organizationId),
        ),
      )
      .limit(1);

    if (!caseRecord) {
      throw new ReviewNotFoundError("Case was not found.");
    }

    const [policy] = await tx
      .select()
      .from(reviewPolicies)
      .where(
        and(
          eq(reviewPolicies.id, input.policyId),
          eq(
            reviewPolicies.organizationId,
            scope.organizationId,
          ),
          eq(reviewPolicies.status, "active"),
        ),
      )
      .limit(1);

    if (!policy) {
      throw new ReviewNotFoundError(
        "Active review policy was not found.",
      );
    }

    if (
      policy.eligibleCaseStatuses.length > 0 &&
      !policy.eligibleCaseStatuses.includes(caseRecord.status)
    ) {
      throw new ReviewEligibilityError(
        "The case is not in a status eligible for this review policy.",
      );
    }

    const prerequisiteRows = await tx
      .select({
        relation: reviewPolicyPrerequisites,
        prerequisite: reviewPolicies,
      })
      .from(reviewPolicyPrerequisites)
      .innerJoin(
        reviewPolicies,
        and(
          eq(
            reviewPolicies.id,
            reviewPolicyPrerequisites.prerequisitePolicyId,
          ),
          eq(
            reviewPolicies.organizationId,
            reviewPolicyPrerequisites.organizationId,
          ),
        ),
      )
      .where(
        and(
          eq(
            reviewPolicyPrerequisites.organizationId,
            scope.organizationId,
          ),
          eq(
            reviewPolicyPrerequisites.policyId,
            policy.id,
          ),
        ),
      );

    const policySnapshot = makePolicySnapshot(
      policy,
      prerequisiteRows.map(({ prerequisite }) => prerequisite),
    );

    const [existingOpenReview] = await tx
      .select({ id: caseReviews.id })
      .from(caseReviews)
      .where(
        and(
          eq(caseReviews.organizationId, scope.organizationId),
          eq(caseReviews.caseId, caseRecord.id),
          eq(caseReviews.policyId, policy.id),
          input.parentReviewId
            ? eq(
                caseReviews.parentReviewId,
                input.parentReviewId,
              )
            : isNull(caseReviews.parentReviewId),
          inArray(caseReviews.status, [
            "filed",
            "assigned",
            "under_review",
          ]),
        ),
      )
      .limit(1);

    if (existingOpenReview) {
      throw new ReviewEligibilityError(
        "An open review under this policy already exists for the challenged decision.",
      );
    }

    let challengedAt: Date;
    let challengedSnapshot: Record<string, unknown>;

    if (input.parentReviewId) {
      if (prerequisiteRows.length === 0) {
        throw new ReviewEligibilityError(
          "This review policy does not accept a prior review decision.",
        );
      }

      const [parent] = await tx
        .select()
        .from(caseReviews)
        .where(
          and(
            eq(caseReviews.id, input.parentReviewId),
            eq(
              caseReviews.organizationId,
              scope.organizationId,
            ),
            eq(caseReviews.caseId, caseRecord.id),
          ),
        )
        .limit(1);

      if (
        !parent ||
        parent.status !== "decided" ||
        !parent.decidedAt
      ) {
        throw new ReviewEligibilityError(
          "Parent review must be a decided review on the same case.",
        );
      }

      if (
        !prerequisiteRows.some(
          ({ prerequisite }) =>
            prerequisite.id === parent.policyId,
        )
      ) {
        throw new ReviewEligibilityError(
          "The selected parent review does not satisfy this policy's prerequisites.",
        );
      }

      challengedAt = parent.decidedAt;
      challengedSnapshot = {
        kind: "review_decision",
        reviewId: parent.id,
        policyId: parent.policyId,
        policyKey: parent.policyKeySnapshot,
        policyName: parent.policyNameSnapshot,
        level: parent.levelSnapshot,
        outcome: parent.outcome,
        writtenDecision: parent.writtenDecision,
        remandInstructions: parent.remandInstructions,
        decidedByUserId: parent.decidedByUserId,
        decidedAt: parent.decidedAt.toISOString(),
        capturedAt: filedAt.toISOString(),
      };
    } else {
      if (prerequisiteRows.length > 0) {
        throw new ReviewEligibilityError(
          "This review policy requires a decided prerequisite review.",
        );
      }

      const [latestDecision] = await tx
        .select()
        .from(caseStatusHistory)
        .where(
          and(
            eq(
              caseStatusHistory.organizationId,
              scope.organizationId,
            ),
            eq(caseStatusHistory.caseId, caseRecord.id),
          ),
        )
        .orderBy(desc(caseStatusHistory.createdAt))
        .limit(1);

      challengedAt =
        latestDecision?.createdAt ?? caseRecord.updatedAt;
      challengedSnapshot = {
        kind: "case_decision",
        caseId: caseRecord.id,
        caseNumber: caseRecord.caseNumber,
        caseType: caseRecord.caseType,
        title: caseRecord.title,
        summary: caseRecord.summary,
        status: caseRecord.status,
        priority: caseRecord.priority,
        disposition: caseRecord.disposition,
        workflowVersionId: caseRecord.workflowVersionId,
        decisionEventId: latestDecision?.id ?? null,
        transitionKey: latestDecision?.transitionKey ?? null,
        decisionActorUserId:
          latestDecision?.actorUserId ?? null,
        decisionAt: challengedAt.toISOString(),
        capturedAt: filedAt.toISOString(),
      };
    }

    const calendar = await resolveReviewCalendar(
      tx,
      scope,
      policy.calendarId,
      policyTimingNeedsCalendar(policy),
    );

    const filingDeadlineAt =
      policy.filingWindowValue && policy.filingWindowUnit
        ? addDuration(
            challengedAt,
            policy.filingWindowValue,
            policy.filingWindowUnit as ReviewDurationUnit,
            calendar?.spec ?? null,
          )
        : null;

    if (
      filingDeadlineAt &&
      filedAt.getTime() > filingDeadlineAt.getTime()
    ) {
      throw new ReviewEligibilityError(
        "The filing window for this review has expired.",
      );
    }

    const decisionDueAt =
      policy.decisionDeadlineValue &&
      policy.decisionDeadlineUnit
        ? addDuration(
            filedAt,
            policy.decisionDeadlineValue,
            policy.decisionDeadlineUnit as ReviewDurationUnit,
            calendar?.spec ?? null,
          )
        : null;

    let decisionWarningAt =
      decisionDueAt &&
      policy.decisionWarningBeforeValue &&
      policy.decisionWarningBeforeUnit
        ? subtractDuration(
            decisionDueAt,
            policy.decisionWarningBeforeValue,
            policy.decisionWarningBeforeUnit as ReviewDurationUnit,
            calendar?.spec ?? null,
          )
        : null;

    if (
      decisionWarningAt &&
      decisionWarningAt.getTime() < filedAt.getTime()
    ) {
      decisionWarningAt = new Date(filedAt);
    }

    const [review] = await tx
      .insert(caseReviews)
      .values({
        organizationId: scope.organizationId,
        caseId: caseRecord.id,
        policyId: policy.id,
        parentReviewId: input.parentReviewId ?? null,
        policyKeySnapshot: policy.key,
        policyNameSnapshot: policy.name,
        levelSnapshot: policy.level,
        policySnapshot,
        challengedSnapshot,
        status: "filed",
        grounds,
        requestedRelief:
          input.requestedRelief?.trim() || null,
        filedByUserId: input.actorUserId,
        filedAt,
        filingDeadlineAt,
        decisionDueAt,
        decisionWarningAt,
      })
      .returning();

    await recordReviewHistory(tx, scope, {
      reviewId: review.id,
      eventType: "filed",
      fromStatus: null,
      toStatus: "filed",
      actorUserId: input.actorUserId,
      occurredAt: filedAt,
      metadata: {
        policyId: policy.id,
        policyKey: policy.key,
        level: policy.level,
        parentReviewId: input.parentReviewId ?? null,
        challengedAt: challengedAt.toISOString(),
        filingDeadlineAt:
          filingDeadlineAt?.toISOString() ?? null,
        decisionDueAt: decisionDueAt?.toISOString() ?? null,
      },
    });

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId: input.actorUserId,
        action: "review.filed",
        resourceType: "case_review",
        resourceId: review.id,
        parentResourceType: "case",
        parentResourceId: caseRecord.id,
        newState: {
          status: review.status,
          policyId: policy.id,
          policyKey: policy.key,
          level: policy.level,
          parentReviewId: review.parentReviewId,
          filedAt: filedAt.toISOString(),
          filingDeadlineAt:
            filingDeadlineAt?.toISOString() ?? null,
          decisionDueAt: decisionDueAt?.toISOString() ?? null,
        },
        metadata: {
          groundsLength: grounds.length,
          requestedReliefProvided: Boolean(
            input.requestedRelief?.trim(),
          ),
        },
      }),
    );

    return review;
  });
}

export async function assignReview(
  db: Database,
  scope: TenantScope,
  input: {
    reviewId: string;
    reviewerMembershipId: string;
    actorUserId: string;
  },
) {
  return db.transaction(async (tx) => {
    const review = await requireReview(tx, scope, input.reviewId);
    if (
      !["filed", "assigned", "under_review"].includes(
        review.status,
      )
    ) {
      throw new ReviewStateError(
        "Only an open review can be assigned.",
      );
    }

    const [reviewer] = await tx
      .select({
        membershipId: organizationMemberships.id,
        userId: organizationMemberships.userId,
      })
      .from(organizationMemberships)
      .innerJoin(
        users,
        and(
          eq(users.id, organizationMemberships.userId),
          eq(users.status, "active"),
        ),
      )
      .where(
        and(
          eq(
            organizationMemberships.id,
            input.reviewerMembershipId,
          ),
          eq(
            organizationMemberships.organizationId,
            scope.organizationId,
          ),
          eq(organizationMemberships.status, "active"),
        ),
      )
      .limit(1);

    if (!reviewer) {
      throw new ReviewEligibilityError(
        "Reviewer must be an active organization member.",
      );
    }

    const [reviewPermission] = await tx
      .select({ id: rolePermissions.id })
      .from(membershipRoles)
      .innerJoin(
        rolePermissions,
        and(
          eq(rolePermissions.roleId, membershipRoles.roleId),
          eq(
            rolePermissions.organizationId,
            scope.organizationId,
          ),
          eq(rolePermissions.permission, "review:decide"),
        ),
      )
      .where(
        and(
          eq(
            membershipRoles.organizationMembershipId,
            reviewer.membershipId,
          ),
          eq(
            membershipRoles.organizationId,
            scope.organizationId,
          ),
        ),
      )
      .limit(1);

    if (!reviewPermission) {
      throw new ReviewEligibilityError(
        "Assigned reviewer lacks review decision authority.",
      );
    }

    const snapshot = parseReviewPolicySnapshot(
      review.policySnapshot,
    );

    if (snapshot.requireIndependentReviewer) {
      if (reviewer.userId === review.filedByUserId) {
        throw new ReviewEligibilityError(
          "Independent review cannot be assigned to the filer.",
        );
      }

      const challengedActor = getChallengedDecisionActor(
        review.challengedSnapshot,
      );
      if (
        challengedActor &&
        reviewer.userId === challengedActor
      ) {
        throw new ReviewEligibilityError(
          "Independent review cannot be assigned to the challenged decision maker.",
        );
      }
    }

    const now = new Date();
    const nextStatus =
      review.status === "filed" ? "assigned" : review.status;

    const [updated] = await tx
      .update(caseReviews)
      .set({
        reviewerMembershipId: reviewer.membershipId,
        assignedByUserId: input.actorUserId,
        assignedAt: now,
        status: nextStatus,
        updatedAt: now,
      })
      .where(
        and(
          eq(caseReviews.id, review.id),
          eq(
            caseReviews.organizationId,
            scope.organizationId,
          ),
          eq(caseReviews.status, review.status),
          eq(caseReviews.updatedAt, review.updatedAt),
        ),
      )
      .returning();

    if (!updated) throw new ReviewConcurrencyError();

    await recordReviewHistory(tx, scope, {
      reviewId: review.id,
      eventType:
        review.reviewerMembershipId &&
        review.reviewerMembershipId !== reviewer.membershipId
          ? "reassigned"
          : "assigned",
      fromStatus: review.status,
      toStatus: updated.status,
      actorUserId: input.actorUserId,
      occurredAt: now,
      metadata: {
        fromReviewerMembershipId:
          review.reviewerMembershipId,
        toReviewerMembershipId: reviewer.membershipId,
      },
    });

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId: input.actorUserId,
        action: "review.assigned",
        resourceType: "case_review",
        resourceId: review.id,
        parentResourceType: "case",
        parentResourceId: review.caseId,
        previousState: {
          status: review.status,
          reviewerMembershipId:
            review.reviewerMembershipId,
        },
        newState: {
          status: updated.status,
          reviewerMembershipId:
            updated.reviewerMembershipId,
        },
      }),
    );

    await createNotificationForMembershipInTransaction(
      tx,
      scope,
      reviewer.membershipId,
      {
        eventType: "review.assigned",
        severity: "info",
        title: "Review assigned",
        body: `${review.policyNameSnapshot} has been assigned to you.`,
        link: `/admin/cases/${review.caseId}`,
        resourceType: "case_review",
        resourceId: review.id,
      },
    );

    return updated;
  });
}

export async function beginReview(
  db: Database,
  scope: TenantScope,
  input: {
    reviewId: string;
    actorMembershipId: string;
    actorUserId: string;
  },
) {
  return db.transaction(async (tx) => {
    const review = await requireReview(tx, scope, input.reviewId);
    if (review.status !== "assigned") {
      throw new ReviewStateError(
        "Only an assigned review can be started.",
      );
    }
    if (
      review.reviewerMembershipId !==
      input.actorMembershipId
    ) {
      throw new ReviewEligibilityError(
        "Only the assigned reviewer can start this review.",
      );
    }

    const now = new Date();
    const [updated] = await tx
      .update(caseReviews)
      .set({
        status: "under_review",
        startedAt: review.startedAt ?? now,
        updatedAt: now,
      })
      .where(
        and(
          eq(caseReviews.id, review.id),
          eq(caseReviews.status, "assigned"),
        ),
      )
      .returning();

    if (!updated) throw new ReviewConcurrencyError();

    await recordReviewHistory(tx, scope, {
      reviewId: review.id,
      eventType: "started",
      fromStatus: review.status,
      toStatus: updated.status,
      actorUserId: input.actorUserId,
      occurredAt: now,
      metadata: {},
    });

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId: input.actorUserId,
        action: "review.started",
        resourceType: "case_review",
        resourceId: review.id,
        parentResourceType: "case",
        parentResourceId: review.caseId,
        previousState: { status: review.status },
        newState: {
          status: updated.status,
          startedAt: updated.startedAt?.toISOString() ?? null,
        },
      }),
    );

    return updated;
  });
}

export async function decideReview(
  db: Database,
  scope: TenantScope,
  input: {
    reviewId: string;
    actorMembershipId: string;
    actorUserId: string;
    outcome: string;
    writtenDecision: string;
    remandInstructions?: string | null;
  },
) {
  const writtenDecision = input.writtenDecision.trim();
  const outcome = input.outcome.trim();
  const remandInstructions =
    input.remandInstructions?.trim() || null;

  if (!writtenDecision) {
    throw new ReviewStateError(
      "A written review decision is required.",
    );
  }

  return db.transaction(async (tx) => {
    const review = await requireReview(tx, scope, input.reviewId);
    if (
      review.status !== "assigned" &&
      review.status !== "under_review"
    ) {
      throw new ReviewStateError(
        "Only an assigned or active review can be decided.",
      );
    }
    if (
      review.reviewerMembershipId !==
      input.actorMembershipId
    ) {
      throw new ReviewEligibilityError(
        "Only the assigned reviewer can decide this review.",
      );
    }

    const snapshot = parseReviewPolicySnapshot(
      review.policySnapshot,
    );
    if (!snapshot.allowedOutcomes.includes(outcome)) {
      throw new ReviewEligibilityError(
        "Outcome is not allowed by the filed review policy.",
      );
    }

    const now = new Date();
    const [updated] = await tx
      .update(caseReviews)
      .set({
        status: "decided",
        startedAt: review.startedAt ?? now,
        outcome,
        writtenDecision,
        remandInstructions,
        decidedByUserId: input.actorUserId,
        decidedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(caseReviews.id, review.id),
          eq(caseReviews.status, review.status),
        ),
      )
      .returning();

    if (!updated) throw new ReviewConcurrencyError();

    await recordReviewHistory(tx, scope, {
      reviewId: review.id,
      eventType: "decided",
      fromStatus: review.status,
      toStatus: "decided",
      actorUserId: input.actorUserId,
      occurredAt: now,
      metadata: {
        outcome,
        writtenDecisionLength: writtenDecision.length,
        remandInstructionsProvided: Boolean(
          remandInstructions,
        ),
      },
    });

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId: input.actorUserId,
        action: "review.decided",
        resourceType: "case_review",
        resourceId: review.id,
        parentResourceType: "case",
        parentResourceId: review.caseId,
        previousState: { status: review.status },
        newState: {
          status: updated.status,
          outcome: updated.outcome,
          decidedAt: updated.decidedAt?.toISOString() ?? null,
        },
        metadata: {
          writtenDecisionLength: writtenDecision.length,
          remandInstructionsProvided: Boolean(
            remandInstructions,
          ),
        },
      }),
    );

    if (review.filedByUserId) {
      await createNotificationForUserInTransaction(
        tx,
        scope,
        review.filedByUserId,
        {
          eventType: "review.decided",
          severity: "info",
          title: "Review decided",
          body: `${review.policyNameSnapshot} was decided with outcome: ${outcome}.`,
          link: `/admin/cases/${review.caseId}`,
          resourceType: "case_review",
          resourceId: review.id,
        },
      );
    }

    return updated;
  });
}

export async function withdrawReview(
  db: Database,
  scope: TenantScope,
  input: {
    reviewId: string;
    actorUserId: string;
    allowManage: boolean;
  },
) {
  return db.transaction(async (tx) => {
    const review = await requireReview(tx, scope, input.reviewId);
    if (
      !["filed", "assigned", "under_review"].includes(
        review.status,
      )
    ) {
      throw new ReviewStateError(
        "Only an open review can be withdrawn.",
      );
    }

    if (
      review.filedByUserId !== input.actorUserId &&
      !input.allowManage
    ) {
      throw new ReviewEligibilityError(
        "Only the filer or a review manager can withdraw this review.",
      );
    }

    const now = new Date();
    const [updated] = await tx
      .update(caseReviews)
      .set({
        status: "withdrawn",
        withdrawnAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(caseReviews.id, review.id),
          eq(caseReviews.status, review.status),
        ),
      )
      .returning();

    if (!updated) throw new ReviewConcurrencyError();

    await recordReviewHistory(tx, scope, {
      reviewId: review.id,
      eventType: "withdrawn",
      fromStatus: review.status,
      toStatus: "withdrawn",
      actorUserId: input.actorUserId,
      occurredAt: now,
      metadata: {},
    });

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId: input.actorUserId,
        action: "review.withdrawn",
        resourceType: "case_review",
        resourceId: review.id,
        parentResourceType: "case",
        parentResourceId: review.caseId,
        previousState: { status: review.status },
        newState: {
          status: updated.status,
          withdrawnAt:
            updated.withdrawnAt?.toISOString() ?? null,
        },
      }),
    );

    if (review.reviewerMembershipId) {
      await createNotificationForMembershipInTransaction(
        tx,
        scope,
        review.reviewerMembershipId,
        {
          eventType: "review.withdrawn",
          severity: "info",
          title: "Review withdrawn",
          body: `${review.policyNameSnapshot} was withdrawn.`,
          link: `/admin/cases/${review.caseId}`,
          resourceType: "case_review",
          resourceId: review.id,
        },
      );
    }

    return updated;
  });
}

export async function applyReviewDecisionToCase(
  db: Database,
  scope: TenantScope,
  input: {
    reviewId: string;
    targetStatus: string;
    actorUserId: string;
  },
) {
  return db.transaction(async (tx) => {
    const review = await requireReview(tx, scope, input.reviewId);
    if (review.status !== "decided" || !review.outcome) {
      throw new ReviewStateError(
        "Only a decided review can be applied to a case.",
      );
    }
    if (review.caseEffectAppliedAt) {
      throw new ReviewStateError(
        "This review decision has already been applied to the case.",
      );
    }

    const [caseRecord] = await tx
      .select()
      .from(cases)
      .where(
        and(
          eq(cases.id, review.caseId),
          eq(cases.organizationId, scope.organizationId),
        ),
      )
      .limit(1);

    if (!caseRecord) {
      throw new ReviewNotFoundError("Case was not found.");
    }

    const workflow = parseWorkflowDefinition(
      caseRecord.workflowDefinition,
    );
    if (!findWorkflowState(workflow, input.targetStatus)) {
      throw new ReviewEligibilityError(
        "Target status is not declared by the case workflow.",
      );
    }
    if (caseRecord.status === input.targetStatus) {
      throw new ReviewStateError(
        "Review effect must change the case workflow state.",
      );
    }

    const now = new Date();
    const [updatedCase] = await tx
      .update(cases)
      .set({
        status: input.targetStatus,
        openedAt: caseRecord.openedAt ?? now,
        resolvedAt: null,
        closedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(cases.id, caseRecord.id),
          eq(cases.organizationId, scope.organizationId),
          eq(cases.status, caseRecord.status),
        ),
      )
      .returning();

    if (!updatedCase) throw new ReviewConcurrencyError();

    await tx.insert(caseStatusHistory).values({
      organizationId: scope.organizationId,
      caseId: caseRecord.id,
      fromStatus: caseRecord.status,
      toStatus: input.targetStatus,
      actorUserId: input.actorUserId,
      workflowVersionId: caseRecord.workflowVersionId,
      transitionKey: "review_effect",
      note: null,
      metadata: {
        reviewId: review.id,
        policyKey: review.policyKeySnapshot,
        outcome: review.outcome,
      },
    });

    const [updatedReview] = await tx
      .update(caseReviews)
      .set({
        caseEffectAppliedAt: now,
        caseEffectTargetStatus: input.targetStatus,
        updatedAt: now,
      })
      .where(
        and(
          eq(caseReviews.id, review.id),
          isNull(caseReviews.caseEffectAppliedAt),
        ),
      )
      .returning();

    if (!updatedReview) throw new ReviewConcurrencyError();

    await recordReviewHistory(tx, scope, {
      reviewId: review.id,
      eventType: "case_effect_applied",
      fromStatus: review.status,
      toStatus: review.status,
      actorUserId: input.actorUserId,
      occurredAt: now,
      metadata: {
        outcome: review.outcome,
        fromCaseStatus: caseRecord.status,
        toCaseStatus: input.targetStatus,
      },
    });

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId: input.actorUserId,
        action: "review.case_effect_applied",
        resourceType: "case_review",
        resourceId: review.id,
        parentResourceType: "case",
        parentResourceId: caseRecord.id,
        previousState: {
          caseStatus: caseRecord.status,
          caseEffectAppliedAt: null,
        },
        newState: {
          caseStatus: updatedCase.status,
          caseEffectAppliedAt: now.toISOString(),
          caseEffectTargetStatus: input.targetStatus,
        },
        metadata: {
          outcome: review.outcome,
          policyKey: review.policyKeySnapshot,
        },
      }),
    );

    return {
      review: updatedReview,
      case: updatedCase,
    };
  });
}

export async function sweepReviewDeadlines(
  db: Database,
  scope: TenantScope,
  now = new Date(),
) {
  const active = await db
    .select()
    .from(caseReviews)
    .where(
      and(
        eq(caseReviews.organizationId, scope.organizationId),
        inArray(caseReviews.status, [
          "filed",
          "assigned",
          "under_review",
        ]),
      ),
    );

  let warnings = 0;
  let overdue = 0;

  for (const candidate of active) {
    await db.transaction(async (tx) => {
      if (
        candidate.decisionWarningAt &&
        !candidate.decisionWarningIssuedAt &&
        now.getTime() >=
          candidate.decisionWarningAt.getTime() &&
        (!candidate.decisionDueAt ||
          now.getTime() < candidate.decisionDueAt.getTime())
      ) {
        const [warned] = await tx
          .update(caseReviews)
          .set({
            decisionWarningIssuedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(caseReviews.id, candidate.id),
              eq(
                caseReviews.organizationId,
                scope.organizationId,
              ),
              inArray(caseReviews.status, [
                "filed",
                "assigned",
                "under_review",
              ]),
              isNull(caseReviews.decisionWarningIssuedAt),
            ),
          )
          .returning();

        if (warned) {
          await recordReviewHistory(tx, scope, {
            reviewId: candidate.id,
            eventType: "deadline_warning",
            fromStatus: candidate.status,
            toStatus: candidate.status,
            actorUserId: null,
            occurredAt: now,
            metadata: {
              decisionDueAt:
                candidate.decisionDueAt?.toISOString() ?? null,
            },
          });

          await tx.insert(auditEvents).values(
            auditEventValues({
              organizationId: scope.organizationId,
              actorType: "system",
              action: "review.deadline_warning",
              resourceType: "case_review",
              resourceId: candidate.id,
              parentResourceType: "case",
              parentResourceId: candidate.caseId,
              newState: {
                decisionWarningIssuedAt:
                  now.toISOString(),
              },
            }),
          );

          if (candidate.reviewerMembershipId) {
            await createNotificationForMembershipInTransaction(
              tx,
              scope,
              candidate.reviewerMembershipId,
              {
                eventType: "review.deadline_warning",
                severity: "warning",
                title: "Review decision deadline approaching",
                body: `${candidate.policyNameSnapshot} is approaching its decision deadline.`,
                link: `/admin/cases/${candidate.caseId}`,
                resourceType: "case_review",
                resourceId: candidate.id,
              },
            );
          }

          warnings += 1;
        }
      }

      if (
        candidate.decisionDueAt &&
        !candidate.decisionOverdueAt &&
        now.getTime() >= candidate.decisionDueAt.getTime()
      ) {
        const [overdueReview] = await tx
          .update(caseReviews)
          .set({
            decisionOverdueAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(caseReviews.id, candidate.id),
              eq(
                caseReviews.organizationId,
                scope.organizationId,
              ),
              inArray(caseReviews.status, [
                "filed",
                "assigned",
                "under_review",
              ]),
              isNull(caseReviews.decisionOverdueAt),
            ),
          )
          .returning();

        if (overdueReview) {
          await recordReviewHistory(tx, scope, {
            reviewId: candidate.id,
            eventType: "deadline_overdue",
            fromStatus: candidate.status,
            toStatus: candidate.status,
            actorUserId: null,
            occurredAt: now,
            metadata: {
              decisionDueAt:
                candidate.decisionDueAt.toISOString(),
            },
          });

          await tx.insert(auditEvents).values(
            auditEventValues({
              organizationId: scope.organizationId,
              actorType: "system",
              action: "review.deadline_overdue",
              resourceType: "case_review",
              resourceId: candidate.id,
              parentResourceType: "case",
              parentResourceId: candidate.caseId,
              newState: {
                decisionOverdueAt: now.toISOString(),
              },
            }),
          );

          if (candidate.reviewerMembershipId) {
            await createNotificationForMembershipInTransaction(
              tx,
              scope,
              candidate.reviewerMembershipId,
              {
                eventType: "review.deadline_overdue",
                severity: "critical",
                title: "Review decision overdue",
                body: `${candidate.policyNameSnapshot} has passed its decision deadline.`,
                link: `/admin/cases/${candidate.caseId}`,
                resourceType: "case_review",
                resourceId: candidate.id,
              },
            );
          }

          overdue += 1;
        }
      }
    });
  }

  return { warnings, overdue };
}

async function requireReview(
  tx: DatabaseTransaction,
  scope: TenantScope,
  reviewId: string,
) {
  const [review] = await tx
    .select()
    .from(caseReviews)
    .where(
      and(
        eq(caseReviews.id, reviewId),
        eq(caseReviews.organizationId, scope.organizationId),
      ),
    )
    .limit(1);

  if (!review) throw new ReviewNotFoundError();
  return review;
}

async function resolveReviewCalendar(
  tx: DatabaseTransaction,
  scope: TenantScope,
  calendarId: string | null,
  required: boolean,
) {
  if (!calendarId) {
    if (required) {
      throw new ReviewEligibilityError(
        "Business-day review timing requires an active deadline calendar.",
      );
    }
    return null;
  }

  const [calendar] = await tx
    .select()
    .from(deadlineCalendars)
    .where(
      and(
        eq(deadlineCalendars.id, calendarId),
        eq(
          deadlineCalendars.organizationId,
          scope.organizationId,
        ),
        eq(deadlineCalendars.status, "active"),
      ),
    )
    .limit(1);

  if (!calendar) {
    throw new ReviewEligibilityError(
      "Review deadline calendar is unavailable.",
    );
  }

  const exclusions = await tx
    .select({
      localDate: deadlineCalendarExclusions.localDate,
    })
    .from(deadlineCalendarExclusions)
    .where(
      and(
        eq(
          deadlineCalendarExclusions.organizationId,
          scope.organizationId,
        ),
        eq(
          deadlineCalendarExclusions.calendarId,
          calendar.id,
        ),
      ),
    );

  return {
    id: calendar.id,
    spec: {
      timeZone: calendar.timeZone,
      weekendDays: calendar.weekendDays,
      excludedLocalDates: new Set(
        exclusions.map((entry) => entry.localDate),
      ),
    } satisfies DeadlineCalendarSpec,
  };
}

function makePolicySnapshot(
  policy: typeof reviewPolicies.$inferSelect,
  prerequisites: Array<typeof reviewPolicies.$inferSelect>,
): ReviewPolicySnapshot {
  return {
    schemaVersion: 1,
    key: policy.key,
    name: policy.name,
    description: policy.description,
    level: policy.level,
    eligibleCaseStatuses: [...policy.eligibleCaseStatuses],
    filingWindow:
      policy.filingWindowValue && policy.filingWindowUnit
        ? {
            value: policy.filingWindowValue,
            unit:
              policy.filingWindowUnit as ReviewDurationUnit,
          }
        : null,
    decisionDeadline:
      policy.decisionDeadlineValue &&
      policy.decisionDeadlineUnit
        ? {
            value: policy.decisionDeadlineValue,
            unit:
              policy.decisionDeadlineUnit as ReviewDurationUnit,
            warningBefore:
              policy.decisionWarningBeforeValue &&
              policy.decisionWarningBeforeUnit
                ? {
                    value:
                      policy.decisionWarningBeforeValue,
                    unit:
                      policy.decisionWarningBeforeUnit as ReviewDurationUnit,
                  }
                : null,
          }
        : null,
    calendarId: policy.calendarId,
    allowedOutcomes: [...policy.allowedOutcomes],
    requireIndependentReviewer:
      policy.requireIndependentReviewer,
    prerequisitePolicies: prerequisites.map(
      (prerequisite) => ({
        id: prerequisite.id,
        key: prerequisite.key,
        name: prerequisite.name,
        level: prerequisite.level,
      }),
    ),
  };
}

function policyNeedsCalendar(policy: ReviewPolicyInput) {
  return (
    policy.filingWindow?.unit === "business_days" ||
    policy.decisionDeadline?.unit === "business_days" ||
    policy.decisionDeadline?.warningBefore?.unit ===
      "business_days"
  );
}

function policyTimingNeedsCalendar(
  policy: typeof reviewPolicies.$inferSelect,
) {
  return (
    policy.filingWindowUnit === "business_days" ||
    policy.decisionDeadlineUnit === "business_days" ||
    policy.decisionWarningBeforeUnit === "business_days"
  );
}

function getChallengedDecisionActor(
  snapshot: Record<string, unknown>,
): string | null {
  const caseActor = snapshot.decisionActorUserId;
  if (typeof caseActor === "string" && caseActor) {
    return caseActor;
  }

  const reviewActor = snapshot.decidedByUserId;
  if (typeof reviewActor === "string" && reviewActor) {
    return reviewActor;
  }

  return null;
}

async function recordReviewHistory(
  tx: DatabaseTransaction,
  scope: TenantScope,
  input: {
    reviewId: string;
    eventType: string;
    fromStatus: string | null;
    toStatus: string | null;
    actorUserId: string | null;
    occurredAt: Date;
    metadata: Record<string, unknown>;
  },
) {
  await tx.insert(caseReviewHistory).values({
    organizationId: scope.organizationId,
    reviewId: input.reviewId,
    eventType: input.eventType,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    actorUserId: input.actorUserId,
    metadata: input.metadata,
    occurredAt: input.occurredAt,
  });
}
