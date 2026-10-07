"use server";

import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import { answersFromFormData } from "@/modules/forms/form-data";
import { findPublishedFormBySlugs } from "@/modules/forms/repository";
import {
  FormNotAvailableError,
  SubmissionValidationError,
  submitPublicForm,
} from "@/modules/forms/service";
import type { PublicFormActionState } from "@/modules/forms/public-action-state";

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

  try {
    const submission = await submitPublicForm(
      db,
      organizationSlug,
      formSlug,
      answers,
    );

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
