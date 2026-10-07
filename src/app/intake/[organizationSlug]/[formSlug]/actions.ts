"use server";

import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import { createTrustedTenantScope } from "@/lib/tenancy";
import { answersFromFormData } from "@/modules/forms/form-data";
import { findPublishedFormBySlugs } from "@/modules/forms/repository";
import {
  FormNotAvailableError,
  SubmissionValidationError,
  submitPublicForm,
} from "@/modules/forms/service";
import type { PublicFormActionState } from "@/modules/forms/public-action-state";
import {
  cleanupStagedPublicUploads,
  PublicUploadValidationError,
  stagePublicSubmissionUploads,
  type StagedPublicUploadSet,
} from "@/modules/documents/public-upload";

export async function submitPublicFormAction(
  organizationSlug: string,
  formSlug: string,
  _previousState: PublicFormActionState,
  formData: FormData,
): Promise<PublicFormActionState> {
  const db = getRuntimeDatabase();
  const published = await findPublishedFormBySlugs(
    db,
    organizationSlug,
    formSlug,
    { publicOnly: true },
  );

  if (!published) {
    redirect("/intake/unavailable");
  }

  const answers = answersFromFormData(published.definition, formData);
  let stagedUploads: StagedPublicUploadSet | null = null;

  try {
    stagedUploads = await stagePublicSubmissionUploads(
      db,
      createTrustedTenantScope(published.form.organizationId),
      published.definition,
      answers,
      formData,
    );

    const submissionAnswers = {
      ...answers,
      ...stagedUploads.answerReferences,
    };

    let submission: Awaited<ReturnType<typeof submitPublicForm>>;
    try {
      submission = await submitPublicForm(
        db,
        organizationSlug,
        formSlug,
        submissionAnswers,
        null,
        stagedUploads.uploads,
      );
    } catch (error) {
      await cleanupStagedPublicUploads(stagedUploads);
      stagedUploads = null;
      throw error;
    }

    stagedUploads = null;

    if (submission.participantPortalSecret) {
      const trackingCode = submission.confirmationCode ?? "";
      return {
        status: "submitted",
        errors: [],
        confirmationCode: trackingCode,
        participantPortal: {
          trackingCode,
          accessSecret: submission.participantPortalSecret,
          loginPath: `/participant/${encodeURIComponent(
            organizationSlug,
          )}`,
        },
      };
    }

    redirect(
      `/intake/confirmation/${encodeURIComponent(
        submission.confirmationCode ?? "",
      )}`,
    );
  } catch (error) {
    if (error instanceof PublicUploadValidationError) {
      return {
        status: "validation_error",
        errors: error.errors,
      };
    }

    if (error instanceof SubmissionValidationError) {
      return {
        status: "validation_error",
        errors: error.errors,
      };
    }

    if (error instanceof FormNotAvailableError) {
      redirect("/intake/unavailable");
    }

    throw error;
  }

  return { status: "idle", errors: [] };
}
