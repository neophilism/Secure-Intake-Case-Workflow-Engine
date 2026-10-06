"use server";

import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import { createOffice } from "@/modules/organizations/repository";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";

export async function createOfficeAction(formData: FormData) {
  const context = await getCurrentAuthorizationContext();
  if (!context) {
    redirect("/login");
  }
  if (!context.tenantScope) {
    redirect("/select-organization");
  }
  if (!hasPermission(context, "office:manage")) {
    redirect("/forbidden");
  }

  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const parentOfficeId =
    String(formData.get("parentOfficeId") ?? "").trim() || null;

  if (!name || !slug) {
    redirect("/admin/organizations?error=invalid_office");
  }

  await createOffice(
    getRuntimeDatabase(),
    requireTenantScope(context),
    { name, slug, parentOfficeId },
  );

  redirect("/admin/organizations");
}
