"use server";

import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import { parseCaseSearchDefinition } from "@/modules/operations/definition";
import {
  createSavedView,
  deleteSavedView,
  setDefaultSavedView,
} from "@/modules/operations/repository";

async function requireCaseViewer() {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope || !context.membership) {
    redirect("/select-organization");
  }
  if (!hasPermission(context, "case:view")) redirect("/forbidden");
  return context;
}

export async function saveOperationalViewAction(formData: FormData) {
  const context = await requireCaseViewer();
  const name = String(formData.get("name") ?? "").trim();
  const raw = String(formData.get("definition") ?? "");
  const isDefault = formData.get("isDefault") === "true";

  let definition;
  try {
    definition = parseCaseSearchDefinition(JSON.parse(raw));
  } catch {
    redirect("/admin/operations?error=invalid_view");
  }

  try {
    await createSavedView(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        ownerMembershipId: context.membership!.id,
        name,
        definition,
        isDefault,
      },
    );
  } catch {
    redirect("/admin/operations?error=save_failed");
  }

  redirect("/admin/operations?saved=1");
}

export async function setDefaultOperationalViewAction(
  formData: FormData,
) {
  const context = await requireCaseViewer();
  const viewId = String(formData.get("viewId") ?? "").trim();
  if (!viewId) redirect("/admin/operations?error=invalid_view");

  try {
    await setDefaultSavedView(
      getRuntimeDatabase(),
      requireTenantScope(context),
      context.membership!.id,
      viewId,
    );
  } catch {
    redirect("/admin/operations?error=default_failed");
  }

  redirect("/admin/operations?saved=1");
}

export async function deleteOperationalViewAction(formData: FormData) {
  const context = await requireCaseViewer();
  const viewId = String(formData.get("viewId") ?? "").trim();
  if (!viewId) redirect("/admin/operations?error=invalid_view");

  await deleteSavedView(
    getRuntimeDatabase(),
    requireTenantScope(context),
    context.membership!.id,
    viewId,
  );

  redirect("/admin/operations?saved=1");
}
