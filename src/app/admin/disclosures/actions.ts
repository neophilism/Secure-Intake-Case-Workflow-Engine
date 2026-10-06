"use server";

import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import {
  configuredDocumentMaxBytes,
  recordMalwareScanResult,
} from "@/modules/documents/service";
import {
  malwareScanStatuses,
  type MalwareScanStatus,
} from "@/modules/documents/policy";
import {
  attachDerivativeToDisclosureVersion,
  createDisclosurePublication,
  createDisclosureRevision,
  createRedactedDocumentDerivative,
  detachDerivativeFromDisclosureVersion,
  parseDisclosureSourceType,
  publishDisclosureVersion,
  reviewDisclosureVersion,
  submitDisclosureVersion,
  withdrawDisclosurePublication,
} from "@/modules/disclosures/service";

async function requireDisclosureContext(
  permission:
    | "disclosure:prepare"
    | "disclosure:review"
    | "disclosure:publish",
) {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope) redirect("/select-organization");
  if (!hasPermission(context, permission)) {
    redirect("/forbidden");
  }
  return context;
}

function parsePublicJson(formData: FormData) {
  const raw = String(formData.get("publicData") ?? "{}").trim();
  if (!raw) return {};
  return JSON.parse(raw) as unknown;
}

export async function createDisclosurePublicationAction(
  formData: FormData,
) {
  const context = await requireDisclosureContext(
    "disclosure:prepare",
  );

  try {
    await createDisclosurePublication(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        sourceType: parseDisclosureSourceType(
          String(formData.get("sourceType") ?? ""),
        ),
        sourceId: String(
          formData.get("sourceId") ?? "",
        ).trim(),
        slug: String(formData.get("slug") ?? "").trim(),
        publicTitle: String(
          formData.get("publicTitle") ?? "",
        ).trim(),
        publicSummary:
          String(
            formData.get("publicSummary") ?? "",
          ).trim() || null,
        publicData: parsePublicJson(formData),
        redactionSummary:
          String(
            formData.get("redactionSummary") ?? "",
          ).trim() || null,
        actorUserId: context.user.id,
        actorPermissions: [...context.permissions],
      },
    );
  } catch {
    redirect(
      "/admin/disclosures?error=publication_create_failed",
    );
  }

  redirect("/admin/disclosures");
}

export async function createDisclosureRevisionAction(
  publicationId: string,
  formData: FormData,
) {
  const context = await requireDisclosureContext(
    "disclosure:prepare",
  );

  try {
    await createDisclosureRevision(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        publicationId,
        publicTitle: String(
          formData.get("publicTitle") ?? "",
        ).trim(),
        publicSummary:
          String(
            formData.get("publicSummary") ?? "",
          ).trim() || null,
        publicData: parsePublicJson(formData),
        redactionSummary:
          String(
            formData.get("redactionSummary") ?? "",
          ).trim() || null,
        actorUserId: context.user.id,
        actorPermissions: [...context.permissions],
      },
    );
  } catch {
    redirect(
      "/admin/disclosures?error=revision_create_failed",
    );
  }

  redirect("/admin/disclosures");
}

export async function submitDisclosureVersionAction(
  versionId: string,
  _formData: FormData,
) {
  const context = await requireDisclosureContext(
    "disclosure:prepare",
  );

  try {
    await submitDisclosureVersion(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        versionId,
        actorUserId: context.user.id,
      },
    );
  } catch {
    redirect("/admin/disclosures?error=submit_failed");
  }

  redirect("/admin/disclosures");
}

export async function reviewDisclosureVersionAction(
  versionId: string,
  decision: "approved" | "rejected",
  formData: FormData,
) {
  const context = await requireDisclosureContext(
    "disclosure:review",
  );

  try {
    await reviewDisclosureVersion(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        versionId,
        decision,
        reviewNote:
          String(formData.get("reviewNote") ?? "").trim() ||
          null,
        actorUserId: context.user.id,
      },
    );
  } catch {
    redirect("/admin/disclosures?error=review_failed");
  }

  redirect("/admin/disclosures");
}

export async function publishDisclosureVersionAction(
  versionId: string,
  _formData: FormData,
) {
  const context = await requireDisclosureContext(
    "disclosure:publish",
  );

  try {
    await publishDisclosureVersion(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        versionId,
        actorUserId: context.user.id,
      },
    );
  } catch {
    redirect("/admin/disclosures?error=publish_failed");
  }

  redirect("/admin/disclosures");
}

export async function withdrawDisclosurePublicationAction(
  publicationId: string,
  formData: FormData,
) {
  const context = await requireDisclosureContext(
    "disclosure:publish",
  );

  try {
    await withdrawDisclosurePublication(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        publicationId,
        reason: String(
          formData.get("reason") ?? "",
        ).trim(),
        actorUserId: context.user.id,
      },
    );
  } catch {
    redirect("/admin/disclosures?error=withdraw_failed");
  }

  redirect("/admin/disclosures");
}

export async function createRedactedDerivativeAction(
  formData: FormData,
) {
  const context = await requireDisclosureContext(
    "disclosure:prepare",
  );

  const file = formData.get("file");
  if (!(file instanceof File) || file.size < 1) {
    redirect("/admin/disclosures?error=derivative_file_required");
  }
  if (file.size > configuredDocumentMaxBytes()) {
    redirect("/admin/disclosures?error=derivative_too_large");
  }

  const audienceRaw = String(
    formData.get("audience") ?? "public",
  );
  const audience =
    audienceRaw === "participant" ? "participant" : "public";

  try {
    await createRedactedDocumentDerivative(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        sourceDocumentVersionId: String(
          formData.get("sourceDocumentVersionId") ?? "",
        ).trim(),
        audience,
        title: String(formData.get("title") ?? "").trim(),
        description:
          String(
            formData.get("description") ?? "",
          ).trim() || null,
        filename: file.name,
        mimeType:
          file.type || "application/octet-stream",
        data: new Uint8Array(await file.arrayBuffer()),
        redactionSummary:
          String(
            formData.get("redactionSummary") ?? "",
          ).trim() || null,
        actorUserId: context.user.id,
        actorPermissions: [...context.permissions],
      },
    );
  } catch {
    redirect(
      "/admin/disclosures?error=derivative_create_failed",
    );
  }

  redirect("/admin/disclosures");
}

export async function recordDerivativeScanAction(
  versionId: string,
  formData: FormData,
) {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope) redirect("/select-organization");
  if (!hasPermission(context, "document:scan_manage")) {
    redirect("/forbidden");
  }

  const rawStatus = String(
    formData.get("status") ?? "",
  );
  if (
    !(malwareScanStatuses as readonly string[]).includes(
      rawStatus,
    )
  ) {
    redirect("/admin/disclosures?error=scan_status_invalid");
  }

  try {
    await recordMalwareScanResult(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        versionId,
        status: rawStatus as MalwareScanStatus,
        provider:
          String(formData.get("provider") ?? "").trim() ||
          "manual-record",
        actorUserId: context.user.id,
      },
    );
  } catch {
    redirect("/admin/disclosures?error=scan_record_failed");
  }

  redirect("/admin/disclosures");
}

export async function attachDerivativeAction(
  publicationVersionId: string,
  formData: FormData,
) {
  const context = await requireDisclosureContext(
    "disclosure:prepare",
  );

  try {
    await attachDerivativeToDisclosureVersion(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        publicationVersionId,
        documentDerivativeId: String(
          formData.get("documentDerivativeId") ?? "",
        ).trim(),
        label:
          String(formData.get("label") ?? "").trim() ||
          null,
        sortOrder: Number(
          formData.get("sortOrder") ?? 0,
        ),
        actorUserId: context.user.id,
      },
    );
  } catch {
    redirect("/admin/disclosures?error=attach_failed");
  }

  redirect("/admin/disclosures");
}

export async function detachDerivativeAction(
  publicationVersionId: string,
  derivativeId: string,
  _formData: FormData,
) {
  const context = await requireDisclosureContext(
    "disclosure:prepare",
  );

  try {
    await detachDerivativeFromDisclosureVersion(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        publicationVersionId,
        documentDerivativeId: derivativeId,
        actorUserId: context.user.id,
      },
    );
  } catch {
    redirect("/admin/disclosures?error=detach_failed");
  }

  redirect("/admin/disclosures");
}
