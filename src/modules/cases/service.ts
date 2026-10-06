import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  auditEvents,
  caseNumberSequences,
  caseStatusHistory,
  cases,
  caseTags,
  documentCaseLinks,
  documents,
  documentTypes,
  documentVersions,
  caseWorkflowVersions,
  intakeForms,
  intakeFormWorkflowBindings,
  intakeSubmissions,
} from "@/db/schema";
import type { TenantScope } from "@/lib/tenancy";
import { auditEventValues } from "@/modules/audit/event";
import {
  completeDeadlinesForTransition,
  instantiateDeadlinesForCaseEvent,
} from "@/modules/deadlines/service";
import { formatCaseNumber } from "./case-number";
import {
  isCasePriority,
  type CasePriority,
} from "./lifecycle";
import { normalizeCaseTags } from "./tags";
import { applyTransitionActions } from "@/modules/workflows/actions";
import { defaultCaseWorkflowDefinition } from "@/modules/workflows/default-workflow";
import {
  findTransition,
  parseWorkflowDefinition,
} from "@/modules/workflows/definition";
import {
  evaluateTransitionGuards,
  type GuardFailure,
} from "@/modules/workflows/evaluator";

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

export class WorkflowNotAvailableError extends Error {
  constructor() {
    super("The configured workflow has no published version.");
    this.name = "WorkflowNotAvailableError";
  }
}

export class WorkflowTransitionNotAvailableError extends Error {
  constructor() {
    super("The requested workflow transition is not available from the current state.");
    this.name = "WorkflowTransitionNotAvailableError";
  }
}

export class TransitionGuardError extends Error {
  readonly failures: readonly GuardFailure[];

  constructor(failures: readonly GuardFailure[]) {
    super("Workflow transition requirements were not satisfied.");
    this.name = "TransitionGuardError";
    this.failures = failures;
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

    const [binding] = await tx
      .select()
      .from(intakeFormWorkflowBindings)
      .where(
        and(
          eq(
            intakeFormWorkflowBindings.organizationId,
            scope.organizationId,
          ),
          eq(
            intakeFormWorkflowBindings.formId,
            source.form.id,
          ),
        ),
      )
      .limit(1);

    let workflowVersionId: string | null = null;
    let workflowDefinition = defaultCaseWorkflowDefinition;

    if (binding) {
      const [publishedVersion] = await tx
        .select()
        .from(caseWorkflowVersions)
        .where(
          and(
            eq(
              caseWorkflowVersions.organizationId,
              scope.organizationId,
            ),
            eq(
              caseWorkflowVersions.workflowId,
              binding.workflowId,
            ),
            eq(caseWorkflowVersions.status, "published"),
          ),
        )
        .limit(1);

      if (!publishedVersion) {
        throw new WorkflowNotAvailableError();
      }

      workflowVersionId = publishedVersion.id;
      workflowDefinition = parseWorkflowDefinition(
        publishedVersion.definition,
      );
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
        workflowVersionId,
        workflowDefinition,
        title,
        status: workflowDefinition.initialState,
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
      toStatus: workflowDefinition.initialState,
      actorUserId: input.actorUserId,
      workflowVersionId,
      transitionKey: null,
      note: "Case created from submitted intake.",
      metadata: {
        source: "submitted_intake",
        workflowInitialState: workflowDefinition.initialState,
      },
    });

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId: input.actorUserId,
        action: "case.created",
        resourceType: "case",
        resourceId: record.id,
        parentResourceType: "submission",
        parentResourceId: source.submission.id,
        newState: {
          status: record.status,
          priority: record.priority,
        },
        metadata: {
          caseNumber: record.caseNumber,
          caseType: record.caseType,
          workflowVersionId: record.workflowVersionId,
        },
      }),
    );

    await instantiateDeadlinesForCaseEvent(tx, scope, {
      caseId: record.id,
      workflow: workflowDefinition,
      trigger: { type: "case_created" },
      actorUserId: input.actorUserId,
      startedAt: now,
    });

    return record;
  });
}

export async function transitionCase(
  db: Database,
  scope: TenantScope,
  input: {
    caseId: string;
    transitionKey: string;
    actorUserId: string;
    actorPermissions: readonly string[];
    comment?: string | null;
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

    const workflowDefinition = parseWorkflowDefinition(
      current.workflowDefinition,
    );
    const transition = findTransition(
      workflowDefinition,
      input.transitionKey,
      current.status,
    );

    if (!transition) {
      throw new WorkflowTransitionNotAvailableError();
    }

    let submissionAnswers: Record<string, unknown> | null = null;
    if (
      transition.guards.requiredSubmissionFields.length > 0 &&
      current.sourceSubmissionId
    ) {
      const [source] = await tx
        .select({ answers: intakeSubmissions.answers })
        .from(intakeSubmissions)
        .where(
          and(
            eq(
              intakeSubmissions.id,
              current.sourceSubmissionId,
            ),
            eq(
              intakeSubmissions.organizationId,
              scope.organizationId,
            ),
          ),
        )
        .limit(1);

      submissionAnswers = source?.answers ?? null;
    }

    const existingTags = await tx
      .select({ tag: caseTags.tag })
      .from(caseTags)
      .where(
        and(
          eq(caseTags.caseId, current.id),
          eq(caseTags.organizationId, scope.organizationId),
        ),
      );

    let trustedDocumentTypes: string[] = [];
    if (transition.guards.requiredDocuments.length > 0) {
      const rows = await tx
        .select({
          type: documentTypes.key,
          sha256: documentVersions.sha256,
        })
        .from(documentCaseLinks)
        .innerJoin(
          documentVersions,
          and(
            eq(
              documentVersions.id,
              documentCaseLinks.documentVersionId,
            ),
            eq(
              documentVersions.organizationId,
              documentCaseLinks.organizationId,
            ),
            eq(documentVersions.contentStatus, "available"),
            eq(documentVersions.malwareScanStatus, "clean"),
          ),
        )
        .innerJoin(
          documents,
          and(
            eq(documents.id, documentVersions.documentId),
            eq(
              documents.organizationId,
              documentCaseLinks.organizationId,
            ),
            eq(documents.status, "active"),
          ),
        )
        .innerJoin(
          documentTypes,
          and(
            eq(documentTypes.id, documents.documentTypeId),
            eq(
              documentTypes.organizationId,
              documentCaseLinks.organizationId,
            ),
            eq(documentTypes.status, "active"),
          ),
        )
        .where(
          and(
            eq(
              documentCaseLinks.organizationId,
              scope.organizationId,
            ),
            eq(documentCaseLinks.caseId, current.id),
          ),
        );

      trustedDocumentTypes = rows
        .filter((row) => /^[a-f0-9]{64}$/i.test(row.sha256))
        .map((row) => row.type);
    }

    if (!isCasePriority(current.priority)) {
      throw new Error(`Unsupported case priority: ${current.priority}`);
    }

    const proposedDisposition =
      input.disposition !== undefined
        ? input.disposition?.trim() || null
        : current.disposition;

    const failures = evaluateTransitionGuards(transition, {
      actorPermissions: new Set(input.actorPermissions),
      comment: input.comment,
      caseRecord: {
        title: current.title,
        summary: current.summary,
        disposition: proposedDisposition,
        sourceSubmissionId: current.sourceSubmissionId,
      },
      submissionAnswers,
      documentTypes: trustedDocumentTypes,
    });

    if (failures.length > 0) {
      throw new TransitionGuardError(failures);
    }

    const now = new Date();
    const actionResult = applyTransitionActions(
      {
        priority: current.priority,
        disposition: proposedDisposition,
        openedAt: current.openedAt,
        resolvedAt: current.resolvedAt,
        closedAt: current.closedAt,
        tags: existingTags.map((entry) => entry.tag),
      },
      transition.actions,
      now,
    );

    const [updated] = await tx
      .update(cases)
      .set({
        status: transition.to,
        priority: actionResult.casePatch.priority,
        disposition: actionResult.casePatch.disposition,
        openedAt: actionResult.casePatch.openedAt,
        resolvedAt: actionResult.casePatch.resolvedAt,
        closedAt: actionResult.casePatch.closedAt,
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

    await tx
      .delete(caseTags)
      .where(
        and(
          eq(caseTags.caseId, current.id),
          eq(caseTags.organizationId, scope.organizationId),
        ),
      );

    if (actionResult.tags.length > 0) {
      await tx.insert(caseTags).values(
        actionResult.tags.map((tag) => ({
          organizationId: scope.organizationId,
          caseId: current.id,
          tag,
        })),
      );
    }

    await tx.insert(caseStatusHistory).values({
      organizationId: scope.organizationId,
      caseId: current.id,
      fromStatus: current.status,
      toStatus: transition.to,
      actorUserId: input.actorUserId,
      workflowVersionId: current.workflowVersionId,
      transitionKey: transition.key,
      note: input.comment?.trim() || null,
      metadata: {
        automaticActions: transition.actions,
      },
    });

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId: input.actorUserId,
        action: "case.transitioned",
        resourceType: "case",
        resourceId: current.id,
        previousState: {
          status: current.status,
          priority: current.priority,
          disposition: current.disposition,
        },
        newState: {
          status: updated.status,
          priority: updated.priority,
          disposition: updated.disposition,
        },
        metadata: {
          transitionKey: transition.key,
          workflowVersionId: current.workflowVersionId,
          automaticActions: transition.actions,
          commentProvided: Boolean(input.comment?.trim()),
        },
      }),
    );

    await completeDeadlinesForTransition(tx, scope, {
      caseId: current.id,
      workflow: workflowDefinition,
      transitionKey: transition.key,
      actorUserId: input.actorUserId,
      occurredAt: now,
    });

    await instantiateDeadlinesForCaseEvent(tx, scope, {
      caseId: current.id,
      workflow: workflowDefinition,
      trigger: {
        type: "transition",
        transitionKey: transition.key,
      },
      actorUserId: input.actorUserId,
      startedAt: now,
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
    actorUserId: string;
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

    let normalizedTags: string[] | undefined;
    if (input.tags !== undefined) {
      normalizedTags = normalizeCaseTags(input.tags);

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

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId: input.actorUserId,
        action: "case.updated",
        resourceType: "case",
        resourceId: current.id,
        previousState: {
          priority: current.priority,
          disposition: current.disposition,
        },
        newState: {
          priority: updated.priority,
          disposition: updated.disposition,
          tagsChanged: input.tags !== undefined,
        },
        metadata: {
          titleChanged: current.title !== updated.title,
          summaryChanged: current.summary !== updated.summary,
          tags: normalizedTags ?? null,
        },
      }),
    );

    return updated;
  });
}

export function parseCasePriority(value: string): CasePriority {
  if (!isCasePriority(value)) {
    throw new Error("Case priority is invalid.");
  }
  return value;
}
