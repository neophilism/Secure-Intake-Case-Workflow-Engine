import type { Database } from "@/db/client";
import {
  createConfirmationCode,
  createDraftResumeToken,
  hashDraftResumeToken,
} from "./draft-token";
import type { AnswerMap } from "./visibility";
import { validateSubmissionAnswers } from "./validation";
import {
  findPublishedFormBySlugs,
  findSubmissionDraftByTokenHash,
  findVersionForSubmission,
  finalizeDraftSubmission,
  insertSubmission,
  updateDraftSubmission,
} from "./repository";

export class FormNotAvailableError extends Error {
  constructor() {
    super("The requested form is not available.");
    this.name = "FormNotAvailableError";
  }
}

export class SubmissionValidationError extends Error {
  readonly errors: Array<{ fieldId: string; message: string }>;

  constructor(errors: Array<{ fieldId: string; message: string }>) {
    super("Submission validation failed.");
    this.name = "SubmissionValidationError";
    this.errors = errors;
  }
}

export interface DraftSubmissionResult {
  submissionId: string;
  resumeToken: string;
}

export async function createPublicDraftSubmission(
  db: Database,
  organizationSlug: string,
  formSlug: string,
  rawAnswers: AnswerMap,
): Promise<DraftSubmissionResult> {
  const published = await findPublishedFormBySlugs(
    db,
    organizationSlug,
    formSlug,
    { publicOnly: true },
  );

  if (!published) {
    throw new FormNotAvailableError();
  }

  const validation = validateSubmissionAnswers(
    published.definition,
    rawAnswers,
    { partial: true },
  );
  if (!validation.success) {
    throw new SubmissionValidationError(validation.errors);
  }

  const resumeToken = createDraftResumeToken();

  const submission = await insertSubmission(db, {
    organizationId: published.form.organizationId,
    formId: published.form.id,
    formVersionId: published.version.id,
    status: "draft",
    answers: validation.answers,
    draftTokenHash: hashDraftResumeToken(resumeToken),
  });

  return {
    submissionId: submission.id,
    resumeToken,
  };
}

export async function updateDraftSubmissionByToken(
  db: Database,
  resumeToken: string,
  rawAnswers: AnswerMap,
) {
  const submission = await findSubmissionDraftByTokenHash(
    db,
    hashDraftResumeToken(resumeToken),
  );
  if (!submission) {
    throw new FormNotAvailableError();
  }

  const { definition } = await findVersionForSubmission(db, submission);
  const validation = validateSubmissionAnswers(
    definition,
    rawAnswers,
    { partial: true },
  );

  if (!validation.success) {
    throw new SubmissionValidationError(validation.errors);
  }

  return updateDraftSubmission(
    db,
    submission.id,
    validation.answers,
  );
}

export async function submitDraftSubmissionByToken(
  db: Database,
  resumeToken: string,
  rawAnswers: AnswerMap,
) {
  const submission = await findSubmissionDraftByTokenHash(
    db,
    hashDraftResumeToken(resumeToken),
  );
  if (!submission) {
    throw new FormNotAvailableError();
  }

  const { definition } = await findVersionForSubmission(db, submission);
  const validation = validateSubmissionAnswers(
    definition,
    rawAnswers,
  );

  if (!validation.success) {
    throw new SubmissionValidationError(validation.errors);
  }

  const finalized = await finalizeDraftSubmission(
    db,
    submission.id,
    validation.answers,
    createConfirmationCode(),
  );

  if (!finalized) {
    throw new FormNotAvailableError();
  }

  return finalized;
}

export async function submitPublicForm(
  db: Database,
  organizationSlug: string,
  formSlug: string,
  rawAnswers: AnswerMap,
  submitterUserId?: string | null,
) {
  const published = await findPublishedFormBySlugs(
    db,
    organizationSlug,
    formSlug,
    { publicOnly: true },
  );

  if (!published) {
    throw new FormNotAvailableError();
  }

  const validation = validateSubmissionAnswers(
    published.definition,
    rawAnswers,
  );

  if (!validation.success) {
    throw new SubmissionValidationError(validation.errors);
  }

  return insertSubmission(db, {
    organizationId: published.form.organizationId,
    formId: published.form.id,
    formVersionId: published.version.id,
    submitterUserId: submitterUserId ?? null,
    status: "submitted",
    answers: validation.answers,
    confirmationCode: createConfirmationCode(),
  });
}
