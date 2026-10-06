import { NextResponse } from "next/server";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import {
  parseDocumentVisibility,
  uploadDocumentToCase,
} from "@/modules/documents/service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ caseId: string }>;
  },
) {
  const context = await getCurrentAuthorizationContext();
  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!context.tenantScope) {
    return NextResponse.json(
      { error: "organization_required" },
      { status: 400 },
    );
  }
  if (
    !hasPermission(context, "document:upload") ||
    !hasPermission(context, "case:view")
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { caseId } = await params;
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size < 1) {
    return NextResponse.redirect(
      new URL(
        `/admin/cases/${caseId}?error=document_file_required`,
        request.url,
      ),
      303,
    );
  }

  try {
    await uploadDocumentToCase(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        caseId,
        documentTypeId: String(
          formData.get("documentTypeId") ?? "",
        ),
        title: String(formData.get("title") ?? file.name),
        description: String(
          formData.get("description") ?? "",
        ),
        visibility: parseDocumentVisibility(
          String(formData.get("visibility") ?? "internal"),
        ),
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        data: new Uint8Array(await file.arrayBuffer()),
        actorUserId: context.user.id,
        evidenceDescription: String(
          formData.get("evidenceDescription") ?? "",
        ),
        sourceDescription: String(
          formData.get("sourceDescription") ?? "",
        ),
        exhibitLabel: String(
          formData.get("exhibitLabel") ?? "",
        ),
      },
    );
  } catch {
    return NextResponse.redirect(
      new URL(
        `/admin/cases/${caseId}?error=document_upload_failed`,
        request.url,
      ),
      303,
    );
  }

  return NextResponse.redirect(
    new URL(
      `/admin/cases/${caseId}?document=uploaded`,
      request.url,
    ),
    303,
  );
}
