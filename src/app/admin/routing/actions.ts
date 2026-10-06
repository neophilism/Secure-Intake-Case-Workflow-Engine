"use server";

import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import { parseRoutingRuleDefinition } from "@/modules/routing/definition";
import {
  addTeamMember,
  createQueue,
  createRoutingRule,
  createTeam,
  setTeamMemberAvailability,
} from "@/modules/routing/service";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function requireRoutingManager() {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope) redirect("/select-organization");
  if (!hasPermission(context, "routing:manage")) {
    redirect("/forbidden");
  }
  return context;
}

export async function createTeamAction(formData: FormData) {
  const context = await requireRoutingManager();
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const officeId = String(formData.get("officeId") ?? "").trim();
  const description = String(
    formData.get("description") ?? "",
  ).trim();

  if (!name || !slugPattern.test(slug)) {
    redirect("/admin/routing?error=invalid_team");
  }

  try {
    await createTeam(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        name,
        slug,
        officeId: officeId || null,
        description: description || null,
        actorUserId: context.user.id,
      },
    );
  } catch {
    redirect("/admin/routing?error=create_team_failed");
  }

  redirect("/admin/routing");
}

export async function addTeamMemberAction(formData: FormData) {
  const context = await requireRoutingManager();
  const teamId = String(formData.get("teamId") ?? "").trim();
  const membershipId = String(
    formData.get("membershipId") ?? "",
  ).trim();

  if (!teamId || !membershipId) {
    redirect("/admin/routing?error=invalid_team_member");
  }

  try {
    await addTeamMember(
      getRuntimeDatabase(),
      requireTenantScope(context),
      { teamId, membershipId, actorUserId: context.user.id },
    );
  } catch {
    redirect("/admin/routing?error=team_member_failed");
  }

  redirect("/admin/routing");
}

export async function setTeamMemberAvailabilityAction(
  formData: FormData,
) {
  const context = await requireRoutingManager();
  const teamMembershipId = String(
    formData.get("teamMembershipId") ?? "",
  ).trim();
  const isAvailable =
    String(formData.get("isAvailable") ?? "") === "true";

  if (!teamMembershipId) {
    redirect("/admin/routing?error=invalid_availability");
  }

  try {
    await setTeamMemberAvailability(
      getRuntimeDatabase(),
      requireTenantScope(context),
      { teamMembershipId, isAvailable, actorUserId: context.user.id },
    );
  } catch {
    redirect("/admin/routing?error=availability_failed");
  }

  redirect("/admin/routing");
}

export async function createQueueAction(formData: FormData) {
  const context = await requireRoutingManager();
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const teamId = String(formData.get("teamId") ?? "").trim();
  const description = String(
    formData.get("description") ?? "",
  ).trim();
  const strategy = String(
    formData.get("assignmentStrategy") ?? "",
  ).trim();

  if (
    !name ||
    !slugPattern.test(slug) ||
    (strategy !== "manual" && strategy !== "round_robin")
  ) {
    redirect("/admin/routing?error=invalid_queue");
  }

  try {
    await createQueue(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        name,
        slug,
        teamId: teamId || null,
        description: description || null,
        assignmentStrategy: strategy,
        actorUserId: context.user.id,
      },
    );
  } catch {
    redirect("/admin/routing?error=create_queue_failed");
  }

  redirect("/admin/routing");
}

export async function createRoutingRuleAction(formData: FormData) {
  const context = await requireRoutingManager();
  const name = String(formData.get("name") ?? "").trim();
  const priorityRaw = Number(
    String(formData.get("priority") ?? "100"),
  );
  const targetQueueId = String(
    formData.get("targetQueueId") ?? "",
  ).trim();

  let definition;
  try {
    definition = parseRoutingRuleDefinition(
      JSON.parse(String(formData.get("definition") ?? "")),
    );
  } catch {
    redirect("/admin/routing?error=invalid_rule");
  }

  if (
    !name ||
    !targetQueueId ||
    !Number.isInteger(priorityRaw)
  ) {
    redirect("/admin/routing?error=invalid_rule");
  }

  try {
    await createRoutingRule(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        name,
        priority: priorityRaw,
        definition,
        targetQueueId,
        actorUserId: context.user.id,
      },
    );
  } catch {
    redirect("/admin/routing?error=create_rule_failed");
  }

  redirect("/admin/routing");
}
