import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  caseNumberSequences,
  caseStatusHistory,
  cases,
  caseTags,
  intakeForms,
  intakeSubmissions,
} from "@/db/schema";
import type { TenantScope } from "@/lib/tenancy";
import { formatCaseNumber } from "./case-number";
import {
  assertDefaultCaseTransition,
  isCasePriority,
  isCaseStatus,
  timestampsAfterTransition,
  type CasePriority,
  type CaseStatus,
} from "./lifecycle";
import { normalizeCaseTags } from "./tags";

export class CaseNotFoundError extends Error {
  constructor() {
    super("Case was not found in the active organization.");
    this.name = "CaseNotFoundError";
  }
}

export class SubmissionNotReviewableError extends Error {
  constructor() {
    super("Submission is not available for intake review.");
    this.name = "SubmissionNotReviewableError";
  }
}

export class CaseConcurrencyError extends Error {
  constructor() {
    super("The case changed before this operation completed.");
    this.name = "CaseConcurrencyError";
  }
}

export async function createCaseFromSubmission(
  db: Database,
  scope: TenantScope,
  input: {
    submissionId: string;
    actorUserId: string;
    title?: string;
    priority?: CasePriority;
  },
) {
  if (input.priority !== undefined && !isCasePriority(input.priority)) {
    throw new Error("Case priority is invalid.");
  }

  return db.transaction(async (tx) => {
    const [source] = await tx
      .select({
        submission: intakeSubmissions,
        form: intakeForms,
      })
      .from(intakeSubmissions)
      .innerJoin(
        intakeForms,
        and(
          eq(intakeForms.id, intakeSubmissions.formId),
          eq(
            intakeForms.organizationId,
            intakeSubmissions.organizationId,
          ),
        ),
      )
      .where(
        and(
          eq(intakeSubmissions.id, input.submissionId),
          eq(
            intakeSubmissions.organizationId,
            scope.organizationId,
          ),
          eq(intakeSubmissions.status, "submitted"),
        ),
      )
      .limit(1);

    if (!source) {
      throw new SubmissionNotReviewableError();
    }

    const [existing] = await tx
      .select({ id: cases.id })
      .from(cases)
      .where(eq(cases.sourceSubmissionId, source.submission.id))
      .limit(1);

    if (existing) {
      throw new SubmissionNotReviewableError();
    }

    const now = new Date();
    const calendarYear = now.getUTCFullYear();

    const [sequence] = await tx
      .insert(caseNumberSequences)
      .values({
        organizationId: scope.organizationId,
        calendarYear,
        lastValue: 1,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          caseNumberSequences.organizationId,
          caseNumberSequences.calendarYear,
        ],
        set: {
          lastValue: sql`${caseNumberSequences.lastValue} + 1`,
          updatedAt: now,
        },
      })
      .returning({
        value: caseNumberSequences.lastValue,
      });

    if (!sequence) {
      throw new Error("Unable to allocate a case number.");
    }

    const caseNumber = formatCaseNumber(
      calendarYear,
      sequence.value,
    );
    const fallbackTitle = source.submission.confirmationCode
      ? `${source.form.name} — ${source.submission.confirmationCode}`
      : `${source.form.name} — submission`;
    const title = input.title?.trim() || fallbackTitle;

    const [record] = await tx
      .insert(cases)
      .values({
        organizationId: scope.organizationId,
        caseNumber,
        sourceSubmissionId: source.submission.id,
        caseType: source.form.slug,
        title,
        status: "intake_review",
        priority: input.priority ?? "normal",
        createdByUserId: input.actorUserId,
      })
      .returning();

    if (!record) {
      throw new Error("Unable to create case.");
    }

    await tx.insert(caseStatusHistory).values({
      organizationId: scope.organizationId,
      caseId: record.id,
      fromStatus: null,
      toStatus: "intake_review",
      actorUserId: input.actorUserId,
      note: "Case created from submitted intake.",
    });

    return record;
  });
}

export async function transitionCase(
  db: Database,
  scope: TenantScope,
  input: {
    caseId: string;
    toStatus: CaseStatus;
    actorUserId: string;
    note?: string | null;
    disposition?: string | null;
  },
) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(cases)
      .where(
        and(
          eq(cases.id, input.caseId),
          eq(cases.organizationId, scope.organizationId),
        ),
      )
      .limit(1);

    if (!current) {
      throw new CaseNotFoundError();
    }
    if (!isCaseStatus(current.status)) {
      throw new Error(
        `Unsupported default lifecycle status: ${current.status}`,
      );
    }

    assertDefaultCaseTransition(current.status, input.toStatus);

    const now = new Date();
    const timestamps = timestampsAfterTransition(
      {
        openedAt: current.openedAt,
        resolvedAt: current.resolvedAt,
        closedAt: current.closedAt,
      },
      input.toStatus,
      now,
    );

    const [updated] = await tx
      .update(cases)
      .set({
        status: input.toStatus,
        disposition:
          input.disposition !== undefined
            ? input.disposition?.trim() || null
            : current.disposition,
        openedAt: timestamps.openedAt,
        resolvedAt: timestamps.resolvedAt,
        closedAt: timestamps.closedAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(cases.id, current.id),
          eq(cases.organizationId, scope.organizationId),
          eq(cases.status, current.status),
        ),
      )
      .returning();

    if (!updated) {
      throw new CaseConcurrencyError();
    }

    await tx.insert(caseStatusHistory).values({
      organizationId: scope.organizationId,
      caseId: current.id,
      fromStatus: current.status,
      toStatus: input.toStatus,
      actorUserId: input.actorUserId,
      note: input.note?.trim() || null,
    });

    return updated;
  });
}

export async function updateCaseMetadata(
  db: Database,
  scope: TenantScope,
  input: {
    caseId: string;
    title: string;
    summary?: string | null;
    priority: CasePriority;
    disposition?: string | null;
    tags?: readonly string[];
  },
) {
  if (!input.title.trim()) {
    throw new Error("Case title is required.");
  }
  if (!isCasePriority(input.priority)) {
    throw new Error("Case priority is invalid.");
  }

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(cases)
      .where(
        and(
          eq(cases.id, input.caseId),
          eq(cases.organizationId, scope.organizationId),
        ),
      )
      .limit(1);

    if (!current) {
      throw new CaseNotFoundError();
    }

    const [updated] = await tx
      .update(cases)
      .set({
        title: input.title.trim(),
        summary: input.summary?.trim() || null,
        priority: input.priority,
        disposition:
          input.disposition !== undefined
            ? input.disposition?.trim() || null
            : current.disposition,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(cases.id, current.id),
          eq(cases.organizationId, scope.organizationId),
        ),
      )
      .returning();

    if (input.tags !== undefined) {
      const normalizedTags = normalizeCaseTags(input.tags);

      await tx
        .delete(caseTags)
        .where(
          and(
            eq(caseTags.caseId, current.id),
            eq(caseTags.organizationId, scope.organizationId),
          ),
        );

      if (normalizedTags.length > 0) {
        await tx.insert(caseTags).values(
          normalizedTags.map((tag) => ({
            organizationId: scope.organizationId,
            caseId: current.id,
            tag,
          })),
        );
      }
    }

    return updated;
  });
}

export function parseCasePriority(value: string): CasePriority {
  if (!isCasePriority(value)) {
    throw new Error("Case priority is invalid.");
  }
  return value;
}

export function parseCaseStatus(value: string): CaseStatus {
  if (!isCaseStatus(value)) {
    throw new Error("Case status is invalid.");
  }
  return value;
}
