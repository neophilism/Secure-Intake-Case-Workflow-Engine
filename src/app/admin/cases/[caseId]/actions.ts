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
  parseCaseStatus,
  transitionCase,
  updateCaseMetadata,
} from "@/modules/cases/service";

async function requireCaseOperator(permission: "case:update" | "case:close") {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope) redirect("/select-organization");
  if (!hasPermission(context, permission)) redirect("/forbidden");
  return context;
}

export async function updateCaseMetadataAction(
  caseId: string,
  formData: FormData,
) {
  const context = await requireCaseOperator("case:update");

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
  const rawStatus = String(
    formData.get("toStatus") ?? "",
  ).trim();

  let toStatus: ReturnType<typeof parseCaseStatus>;
  try {
    toStatus = parseCaseStatus(rawStatus);
  } catch {
    redirect(`/admin/cases/${caseId}?error=invalid_transition`);
  }

  const requiredPermission =
    toStatus === "closed" ? "case:close" : "case:update";
  const context = await requireCaseOperator(requiredPermission);

  const note = String(formData.get("note") ?? "").trim();
  const disposition = String(
    formData.get("disposition") ?? "",
  ).trim();

  try {
    await transitionCase(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        caseId,
        toStatus,
        actorUserId: context.user.id,
        note: note || null,
        disposition: disposition || undefined,
      },
    );
  } catch {
    redirect(`/admin/cases/${caseId}?error=transition_failed`);
  }

  redirect(`/admin/cases/${caseId}`);
}
