"use server";

import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import {
  parseCasePriority,
  TransitionGuardError,
  transitionCase,
  updateCaseMetadata,
} from "@/modules/cases/service";

async function requireCaseContext() {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope) redirect("/select-organization");
  return context;
}

export async function updateCaseMetadataAction(
  caseId: string,
  formData: FormData,
) {
  const context = await requireCaseContext();
  if (!hasPermission(context, "case:update")) {
    redirect("/forbidden");
  }

  const title = String(formData.get("title") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  const disposition = String(
    formData.get("disposition") ?? "",
  ).trim();
  const rawPriority = String(
    formData.get("priority") ?? "",
  ).trim();
  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((tag) => tag.trim());

  if (!title) {
    redirect(`/admin/cases/${caseId}?error=invalid_metadata`);
  }

  try {
    await updateCaseMetadata(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        caseId,
        title,
        summary: summary || null,
        disposition: disposition || null,
        priority: parseCasePriority(rawPriority),
        tags,
      },
    );
  } catch {
    redirect(`/admin/cases/${caseId}?error=update_failed`);
  }

  redirect(`/admin/cases/${caseId}`);
}

export async function transitionCaseAction(
  caseId: string,
  formData: FormData,
) {
  const context = await requireCaseContext();
  const transitionKey = String(
    formData.get("transitionKey") ?? "",
  ).trim();
  const comment = String(formData.get("comment") ?? "").trim();
  const disposition = String(
    formData.get("disposition") ?? "",
  ).trim();

  if (!transitionKey) {
    redirect(`/admin/cases/${caseId}?error=invalid_transition`);
  }

  try {
    await transitionCase(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        caseId,
        transitionKey,
        actorUserId: context.user.id,
        actorPermissions: [...context.permissions],
        comment: comment || null,
        disposition: disposition || undefined,
        documentTypes: [],
      },
    );
  } catch (error) {
    if (
      error instanceof TransitionGuardError &&
      error.failures.some(
        (failure) => failure.code === "missing_permission",
      )
    ) {
      redirect("/forbidden");
    }

    if (error instanceof TransitionGuardError) {
      redirect(
        `/admin/cases/${caseId}?error=transition_requirements`,
      );
    }

    redirect(`/admin/cases/${caseId}?error=transition_failed`);
  }

  redirect(`/admin/cases/${caseId}`);
}
