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
import { splitProtectedAnswers } from "@/modules/protected-data/answers";
import { encryptProtectedPayload } from "@/modules/protected-data/crypto";
import { synchronizeProtectedCompartments } from "@/modules/protected-data/repository";

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

  const split = splitProtectedAnswers(
    published.definition,
    validation.answers,
  );
  const resumeToken = createDraftResumeToken();

  const submission = await db.transaction(async (tx) => {
    const created = await insertSubmission(tx, {
      organizationId: published.form.organizationId,
      formId: published.form.id,
      formVersionId: published.version.id,
      status: "draft",
      answers: split.ordinaryAnswers,
      draftTokenHash: hashDraftResumeToken(resumeToken),
    });

    await synchronizeProtectedCompartments(tx, {
      organizationId: created.organizationId,
      submissionId: created.id,
      compartments: split.compartments,
      encrypt: encryptProtectedPayload,
    });

    return created;
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

  const split = splitProtectedAnswers(definition, validation.answers);

  return db.transaction(async (tx) => {
    const updated = await updateDraftSubmission(
      tx,
      submission.id,
      split.ordinaryAnswers,
    );
    if (!updated) {
      throw new FormNotAvailableError();
    }

    await synchronizeProtectedCompartments(tx, {
      organizationId: updated.organizationId,
      submissionId: updated.id,
      compartments: split.compartments,
      encrypt: encryptProtectedPayload,
    });

    return updated;
  });
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

  const split = splitProtectedAnswers(definition, validation.answers);

  return db.transaction(async (tx) => {
    const finalized = await finalizeDraftSubmission(
      tx,
      submission.id,
      split.ordinaryAnswers,
      createConfirmationCode(),
    );

    if (!finalized) {
      throw new FormNotAvailableError();
    }

    await synchronizeProtectedCompartments(tx, {
      organizationId: finalized.organizationId,
      submissionId: finalized.id,
      compartments: split.compartments,
      encrypt: encryptProtectedPayload,
    });

    return finalized;
  });
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

  const split = splitProtectedAnswers(
    published.definition,
    validation.answers,
  );

  return db.transaction(async (tx) => {
    const submission = await insertSubmission(tx, {
      organizationId: published.form.organizationId,
      formId: published.form.id,
      formVersionId: published.version.id,
      submitterUserId: submitterUserId ?? null,
      status: "submitted",
      answers: split.ordinaryAnswers,
      confirmationCode: createConfirmationCode(),
    });

    await synchronizeProtectedCompartments(tx, {
      organizationId: submission.organizationId,
      submissionId: submission.id,
      compartments: split.compartments,
      encrypt: encryptProtectedPayload,
    });

    return submission;
  });
}
