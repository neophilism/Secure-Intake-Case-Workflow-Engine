"use server";

import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import { createCaseFromSubmission } from "@/modules/cases/service";

export async function createCaseFromSubmissionAction(
  formData: FormData,
) {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope) redirect("/select-organization");
  if (
    !hasPermission(context, "case:create") ||
    !hasPermission(context, "submission:view")
  ) {
    redirect("/forbidden");
  }

  const submissionId = String(
    formData.get("submissionId") ?? "",
  ).trim();

  if (!submissionId) {
    redirect("/admin/cases?error=invalid_submission");
  }

  try {
    const record = await createCaseFromSubmission(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        submissionId,
        actorUserId: context.user.id,
      },
    );

    redirect(`/admin/cases/${record.id}`);
  } catch {
    redirect("/admin/cases?error=create_failed");
  }
}
