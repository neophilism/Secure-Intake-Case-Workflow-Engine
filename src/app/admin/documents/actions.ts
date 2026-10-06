"use server";

import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import { createDocumentType } from "@/modules/documents/service";

export async function createDocumentTypeAction(formData: FormData) {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope) redirect("/select-organization");
  if (!hasPermission(context, "document:manage")) {
    redirect("/forbidden");
  }

  const key = String(formData.get("key") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(
    formData.get("description") ?? "",
  ).trim();
  const acceptedMimeTypes = String(
    formData.get("acceptedMimeTypes") ?? "",
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const maxBytesRaw = String(formData.get("maxBytes") ?? "").trim();
  const maxBytes = maxBytesRaw ? Number(maxBytesRaw) : null;

  if (
    !key ||
    !name ||
    (maxBytes !== null &&
      (!Number.isSafeInteger(maxBytes) || maxBytes < 1))
  ) {
    redirect("/admin/documents?error=invalid_type");
  }

  try {
    await createDocumentType(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        key,
        name,
        description: description || null,
        acceptedMimeTypes,
        maxBytes,
        actorUserId: context.user.id,
      },
    );
  } catch {
    redirect("/admin/documents?error=create_type_failed");
  }

  redirect("/admin/documents");
}
