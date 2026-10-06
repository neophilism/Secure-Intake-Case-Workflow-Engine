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

export async function submitPublicFormAction(
  organizationSlug: string,
  formSlug: string,
  formData: FormData,
) {
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

    redirect(
      `/intake/confirmation/${encodeURIComponent(
        submission.confirmationCode ?? "",
      )}`,
    );
  } catch (error) {
    if (error instanceof SubmissionValidationError) {
      redirect(
        `/intake/${encodeURIComponent(organizationSlug)}/${encodeURIComponent(
          formSlug,
        )}?error=validation`,
      );
    }

    if (error instanceof FormNotAvailableError) {
      redirect("/intake/unavailable");
    }

    throw error;
  }
}
