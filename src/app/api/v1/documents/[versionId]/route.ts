import { getRuntimeDatabase } from "@/db/runtime";
import { findDocumentVersion } from "@/modules/documents/repository";
import { canViewDocumentVisibility } from "@/modules/documents/policy";
import {
  apiJson,
  authorizeApiRequest,
} from "@/modules/api/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  const auth = await authorizeApiRequest(request, ["document:view"]);
  if (!auth.ok) return auth.response;

  const { versionId } = await params;
  const row = await findDocumentVersion(
    getRuntimeDatabase(),
    auth.context.tenantScope,
    versionId,
  );

  if (
    !row ||
    !canViewDocumentVisibility(
      row.document.visibility,
      auth.context.permissions,
    )
  ) {
    return apiJson(
      auth.context,
      {
        error: {
          code: "not_found",
          message: "Document version not found.",
        },
      },
      { status: 404 },
    );
  }

  return apiJson(auth.context, {
    data: {
      document: row.document,
      version: {
        id: row.version.id,
        documentId: row.version.documentId,
        versionNumber: row.version.versionNumber,
        originalFilename: row.version.originalFilename,
        mimeType: row.version.mimeType,
        sizeBytes: row.version.sizeBytes,
        sha256: row.version.sha256,
        contentStatus: row.version.contentStatus,
        malwareScanStatus: row.version.malwareScanStatus,
        uploadedAt: row.version.uploadedAt,
      },
      type: row.type,
    },
  });
}
