"use server";

import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import { revokeApiClient } from "@/modules/api/auth";
import {
  createWebhookSubscription,
  disableWebhookSubscription,
} from "@/modules/webhooks/service";

async function integrationContext(permission: "api:manage" | "webhook:manage") {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope) redirect("/select-organization");
  if (!hasPermission(context, permission)) redirect("/forbidden");
  return context;
}

export async function revokeApiClientAction(formData: FormData) {
  const context = await integrationContext("api:manage");
  const clientId = String(formData.get("clientId") ?? "").trim();
  if (!clientId) redirect("/admin/integrations?error=invalid_client");

  await revokeApiClient(
    getRuntimeDatabase(),
    requireTenantScope(context),
    { clientId, actorUserId: context.user.id },
  );

  redirect("/admin/integrations?updated=1");
}

export async function createWebhookSubscriptionAction(
  formData: FormData,
) {
  const context = await integrationContext("webhook:manage");
  const eventTypes = String(formData.get("eventTypes") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  try {
    await createWebhookSubscription(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        name: String(formData.get("name") ?? ""),
        endpointUrl: String(formData.get("endpointUrl") ?? ""),
        eventTypes,
        signingSecret: String(formData.get("signingSecret") ?? ""),
        actorUserId: context.user.id,
      },
    );
  } catch {
    redirect("/admin/integrations?error=webhook_create_failed");
  }

  redirect("/admin/integrations?updated=1");
}

export async function disableWebhookSubscriptionAction(
  formData: FormData,
) {
  const context = await integrationContext("webhook:manage");
  const subscriptionId = String(
    formData.get("subscriptionId") ?? "",
  ).trim();
  if (!subscriptionId) {
    redirect("/admin/integrations?error=invalid_webhook");
  }

  await disableWebhookSubscription(
    getRuntimeDatabase(),
    requireTenantScope(context),
    { subscriptionId, actorUserId: context.user.id },
  );

  redirect("/admin/integrations?updated=1");
}
