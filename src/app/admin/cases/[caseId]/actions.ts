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
import {
  applyRoutingRules,
  escalateCase,
  manualAssignCase,
} from "@/modules/routing/service";

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


export async function manualAssignCaseAction(
  caseId: string,
  formData: FormData,
) {
  const context = await requireCaseContext();
  if (!hasPermission(context, "case:assign")) {
    redirect("/forbidden");
  }

  const queueId = String(formData.get("queueId") ?? "").trim();
  const membershipId = String(
    formData.get("membershipId") ?? "",
  ).trim();
  const reason = String(formData.get("reason") ?? "").trim();

  try {
    await manualAssignCase(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        caseId,
        queueId: queueId || null,
        membershipId: membershipId || null,
        actorUserId: context.user.id,
        reason: reason || null,
      },
    );
  } catch {
    redirect(`/admin/cases/${caseId}?error=assignment_failed`);
  }

  redirect(`/admin/cases/${caseId}`);
}

export async function applyRoutingRulesAction(
  caseId: string,
  _formData: FormData,
) {
  const context = await requireCaseContext();
  if (
    !hasPermission(context, "case:assign") ||
    !hasPermission(context, "routing:view")
  ) {
    redirect("/forbidden");
  }

  let matched = false;
  try {
    const result = await applyRoutingRules(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        caseId,
        actorUserId: context.user.id,
      },
    );
    matched = result.matched;
  } catch {
    redirect(`/admin/cases/${caseId}?error=routing_failed`);
  }

  redirect(
    matched
      ? `/admin/cases/${caseId}`
      : `/admin/cases/${caseId}?error=no_routing_match`,
  );
}

export async function escalateCaseAction(
  caseId: string,
  formData: FormData,
) {
  const context = await requireCaseContext();
  if (!hasPermission(context, "case:assign")) {
    redirect("/forbidden");
  }

  const reason = String(formData.get("reason") ?? "").trim();
  const targetQueueId = String(
    formData.get("targetQueueId") ?? "",
  ).trim();
  const priorityRaw = String(
    formData.get("priority") ?? "",
  ).trim();

  if (!reason) {
    redirect(`/admin/cases/${caseId}?error=invalid_escalation`);
  }

  const priority =
    priorityRaw === "low" ||
    priorityRaw === "normal" ||
    priorityRaw === "high" ||
    priorityRaw === "critical"
      ? priorityRaw
      : undefined;

  try {
    await escalateCase(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        caseId,
        actorUserId: context.user.id,
        reason,
        targetQueueId: targetQueueId || null,
        priority,
      },
    );
  } catch {
    redirect(`/admin/cases/${caseId}?error=escalation_failed`);
  }

  redirect(`/admin/cases/${caseId}`);
}
