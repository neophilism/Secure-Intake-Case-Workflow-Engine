"use server";

import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import { applyApplicationManifest } from "@/modules/application/service";

export async function applyApplicationManifestAction(
  formData: FormData,
) {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope) redirect("/select-organization");
  if (!hasPermission(context, "application:manage")) {
    redirect("/forbidden");
  }

  const raw = String(formData.get("manifest") ?? "");
  let manifest: unknown;
  try {
    manifest = JSON.parse(raw);
  } catch {
    redirect("/admin/application?error=invalid_json");
  }

  try {
    const result = await applyApplicationManifest(
      getRuntimeDatabase(),
      requireTenantScope(context),
      manifest,
      context.user.id,
    );
    redirect(
      result.noChange
        ? "/admin/application?unchanged=1"
        : "/admin/application?applied=1",
    );
  } catch {
    redirect("/admin/application?error=manifest_rejected");
  }
}
