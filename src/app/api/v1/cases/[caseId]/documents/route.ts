import { getRuntimeDatabase } from "@/db/runtime";
import { findCaseById } from "@/modules/cases/repository";
import { listCaseDocuments } from "@/modules/documents/repository";
import { canViewDocumentVisibility } from "@/modules/documents/policy";
import {
  apiJson,
  authorizeApiRequest,
} from "@/modules/api/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const auth = await authorizeApiRequest(request, [
    "case:view",
    "document:view",
  ]);
  if (!auth.ok) return auth.response;

  const { caseId } = await params;
  const db = getRuntimeDatabase();
  const record = await findCaseById(
    db,
    auth.context.tenantScope,
    caseId,
  );
  if (!record) {
    return apiJson(
      auth.context,
      { error: { code: "not_found", message: "Case not found." } },
      { status: 404 },
    );
  }

  const rows = await listCaseDocuments(
    db,
    auth.context.tenantScope,
    caseId,
  );
  const visible = rows.filter((row) =>
    canViewDocumentVisibility(
      row.document.visibility,
      auth.context.permissions,
    ),
  );

  return apiJson(auth.context, {
    data: visible.map((row) => ({
      link: row.link,
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
    })),
  });
}
