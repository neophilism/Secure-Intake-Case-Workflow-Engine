"use server";

import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import { readSessionToken } from "@/modules/auth/server-session";
import { selectActiveOrganization } from "@/modules/auth/service";

export async function selectOrganizationAction(formData: FormData) {
  const token = await readSessionToken();
  if (!token) {
    redirect("/login");
  }

  const organizationId = String(formData.get("organizationId") ?? "");

  try {
    await selectActiveOrganization(
      getRuntimeDatabase(),
      token,
      organizationId,
    );
  } catch {
    redirect("/select-organization?error=not_authorized");
  }

  redirect("/admin/organizations");
}
