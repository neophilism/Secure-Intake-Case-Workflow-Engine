"use server";

import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import {
  createCommunicationTemplate,
} from "@/modules/communications/service";
import {
  parseCommunicationChannel,
  parseCommunicationVisibility,
} from "@/modules/communications/policy";

export async function createCommunicationTemplateAction(
  formData: FormData,
) {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope) redirect("/select-organization");
  if (!hasPermission(context, "communication:template_manage")) {
    redirect("/forbidden");
  }

  const key = String(formData.get("key") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const channel = String(formData.get("channel") ?? "email");
  const defaultVisibility = String(
    formData.get("defaultVisibility") ?? "case_participants",
  );
  const subjectTemplate = String(
    formData.get("subjectTemplate") ?? "",
  ).trim();
  const bodyTemplate = String(
    formData.get("bodyTemplate") ?? "",
  ).trim();

  if (!key || !name || !bodyTemplate) {
    redirect("/admin/communications?error=invalid_template");
  }

  try {
    await createCommunicationTemplate(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        key,
        name,
        channel: parseCommunicationChannel(channel),
        subjectTemplate: subjectTemplate || null,
        bodyTemplate,
        defaultVisibility:
          parseCommunicationVisibility(defaultVisibility),
        actorUserId: context.user.id,
      },
    );
  } catch {
    redirect("/admin/communications?error=create_template_failed");
  }

  redirect("/admin/communications");
}
