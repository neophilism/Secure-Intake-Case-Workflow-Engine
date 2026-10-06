"use server";

import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import { createCaseFromSubmission } from "@/modules/cases/service";
import { applyRoutingRules } from "@/modules/routing/service";

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

  const db = getRuntimeDatabase();
  const scope = requireTenantScope(context);
  let record: Awaited<
    ReturnType<typeof createCaseFromSubmission>
  >;

  try {
    record = await createCaseFromSubmission(db, scope, {
      submissionId,
      actorUserId: context.user.id,
    });
  } catch {
    redirect("/admin/cases?error=create_failed");
  }

  let routingFailed = false;
  try {
    await applyRoutingRules(db, scope, {
      caseId: record.id,
      actorUserId: context.user.id,
    });
  } catch {
    routingFailed = true;
  }

  redirect(
    routingFailed
      ? `/admin/cases/${record.id}?error=routing_failed`
      : `/admin/cases/${record.id}`,
  );
}
