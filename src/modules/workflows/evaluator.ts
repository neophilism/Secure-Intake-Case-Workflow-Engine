import type {
  WorkflowTransition,
} from "./definition";

export type GuardFailureCode =
  | "missing_permission"
  | "comment_required"
  | "comment_forbidden"
  | "missing_case_field"
  | "missing_submission_field"
  | "missing_document";

export interface GuardFailure {
  code: GuardFailureCode;
  message: string;
  subject?: string;
}

export interface TransitionEvaluationContext {
  actorPermissions: ReadonlySet<string>;
  comment?: string | null;
  caseRecord: {
    title: string;
    summary: string | null;
    disposition: string | null;
    sourceSubmissionId: string | null;
  };
  submissionAnswers?: Record<string, unknown> | null;
  documentTypes?: readonly string[];
}

export function evaluateTransitionGuards(
  transition: WorkflowTransition,
  context: TransitionEvaluationContext,
): GuardFailure[] {
  const failures: GuardFailure[] = [];
  const comment = context.comment?.trim() ?? "";

  for (const permission of transition.requiredPermissions) {
    if (!context.actorPermissions.has(permission)) {
      failures.push({
        code: "missing_permission",
        subject: permission,
        message: `Missing required permission: ${permission}.`,
      });
    }
  }

  if (transition.comment === "required" && !comment) {
    failures.push({
      code: "comment_required",
      message: "A transition comment is required.",
    });
  }

  if (transition.comment === "forbidden" && comment) {
    failures.push({
      code: "comment_forbidden",
      message: "This transition does not permit a comment.",
    });
  }

  for (const field of transition.guards.requiredCaseFields) {
    const present =
      field === "source_submission"
        ? Boolean(context.caseRecord.sourceSubmissionId)
        : hasMeaningfulValue(context.caseRecord[field]);

    if (!present) {
      failures.push({
        code: "missing_case_field",
        subject: field,
        message: `Required case field is missing: ${field}.`,
      });
    }
  }

  for (const field of transition.guards.requiredSubmissionFields) {
    if (!hasMeaningfulValue(context.submissionAnswers?.[field])) {
      failures.push({
        code: "missing_submission_field",
        subject: field,
        message: `Required submission field is missing: ${field}.`,
      });
    }
  }

  const documentTypes = context.documentTypes ?? [];
  for (const requirement of transition.guards.requiredDocuments) {
    const count = documentTypes.filter(
      (type) => type === requirement.type,
    ).length;

    if (count < requirement.minCount) {
      failures.push({
        code: "missing_document",
        subject: requirement.type,
        message: `Requires at least ${requirement.minCount} document(s) of type ${requirement.type}.`,
      });
    }
  }

  return failures;
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}
