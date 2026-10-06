"use server";

import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import {
  markNotificationRead,
  setNotificationPreference,
} from "@/modules/notifications/service";
import { parseNotificationChannel } from "@/modules/notifications/policy";

async function requireNotificationContext() {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope || !context.membership) {
    redirect("/select-organization");
  }
  if (!hasPermission(context, "notification:view")) {
    redirect("/forbidden");
  }
  return context;
}

export async function markNotificationReadAction(
  notificationId: string,
  _formData: FormData,
) {
  const context = await requireNotificationContext();

  await markNotificationRead(
    getRuntimeDatabase(),
    requireTenantScope(context),
    context.membership!.id,
    notificationId,
  );

  redirect("/notifications");
}

export async function setNotificationPreferenceAction(
  formData: FormData,
) {
  const context = await requireNotificationContext();
  const channel = parseNotificationChannel(
    String(formData.get("channel") ?? ""),
  );
  const enabled =
    String(formData.get("enabled") ?? "false") === "true";
  let destination = String(
    formData.get("destination") ?? "",
  ).trim();

  const canManageExternal = hasPermission(
    context,
    "notification:manage",
  );

  if (channel === "webhook" && !canManageExternal) {
    redirect("/forbidden");
  }

  if (channel === "email" && !canManageExternal) {
    if (
      destination &&
      destination.toLowerCase() !==
        context.user.email.toLowerCase()
    ) {
      redirect("/forbidden");
    }
    destination = context.user.email;
  }

  try {
    await setNotificationPreference(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        membershipId: context.membership!.id,
        eventType: "*",
        channel,
        enabled,
        destination: destination || null,
        actorUserId: context.user.id,
      },
    );
  } catch {
    redirect("/notifications?error=preference_update_failed");
  }

  redirect("/notifications");
}
