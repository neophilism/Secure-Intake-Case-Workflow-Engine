import { and, asc, desc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  documentAccessEvents,
  documentCaseLinks,
  documentCustodyEvents,
  documents,
  documentSubmissionLinks,
  documentTypes,
  documentVersions,
} from "@/db/schema";
import type { TenantScope } from "@/lib/tenancy";

export async function listDocumentTypes(
  db: Database,
  scope: TenantScope,
) {
  return db
    .select()
    .from(documentTypes)
    .where(eq(documentTypes.organizationId, scope.organizationId))
    .orderBy(asc(documentTypes.name));
}

export async function findActiveDocumentTypeByKey(
  db: Database,
  scope: TenantScope,
  key: string,
) {
  const [row] = await db
    .select()
    .from(documentTypes)
    .where(
      and(
        eq(documentTypes.organizationId, scope.organizationId),
        eq(documentTypes.key, key),
        eq(documentTypes.status, "active"),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function listCaseDocuments(
  db: Database,
  scope: TenantScope,
  caseId: string,
) {
  return db
    .select({
      link: documentCaseLinks,
      document: documents,
      version: documentVersions,
      type: documentTypes,
    })
    .from(documentCaseLinks)
    .innerJoin(
      documentVersions,
      and(
        eq(documentVersions.id, documentCaseLinks.documentVersionId),
        eq(
          documentVersions.organizationId,
          documentCaseLinks.organizationId,
        ),
      ),
    )
    .innerJoin(
      documents,
      and(
        eq(documents.id, documentVersions.documentId),
        eq(documents.organizationId, documentCaseLinks.organizationId),
      ),
    )
    .innerJoin(
      documentTypes,
      and(
        eq(documentTypes.id, documents.documentTypeId),
        eq(documentTypes.organizationId, documentCaseLinks.organizationId),
      ),
    )
    .where(
      and(
        eq(documentCaseLinks.organizationId, scope.organizationId),
        eq(documentCaseLinks.caseId, caseId),
      ),
    )
    .orderBy(desc(documentCaseLinks.attachedAt));
}

export async function listSubmissionDocuments(
  db: Database,
  scope: TenantScope,
  submissionId: string,
) {
  return db
    .select({
      link: documentSubmissionLinks,
      document: documents,
      version: documentVersions,
      type: documentTypes,
    })
    .from(documentSubmissionLinks)
    .innerJoin(
      documentVersions,
      and(
        eq(
          documentVersions.id,
          documentSubmissionLinks.documentVersionId,
        ),
        eq(
          documentVersions.organizationId,
          documentSubmissionLinks.organizationId,
        ),
      ),
    )
    .innerJoin(
      documents,
      and(
        eq(documents.id, documentVersions.documentId),
        eq(
          documents.organizationId,
          documentSubmissionLinks.organizationId,
        ),
      ),
    )
    .innerJoin(
      documentTypes,
      and(
        eq(documentTypes.id, documents.documentTypeId),
        eq(
          documentTypes.organizationId,
          documentSubmissionLinks.organizationId,
        ),
      ),
    )
    .where(
      and(
        eq(
          documentSubmissionLinks.organizationId,
          scope.organizationId,
        ),
        eq(documentSubmissionLinks.submissionId, submissionId),
      ),
    )
    .orderBy(desc(documentSubmissionLinks.attachedAt));
}

export async function findDocumentVersion(
  db: Database,
  scope: TenantScope,
  versionId: string,
) {
  const [row] = await db
    .select({
      document: documents,
      version: documentVersions,
      type: documentTypes,
    })
    .from(documentVersions)
    .innerJoin(
      documents,
      and(
        eq(documents.id, documentVersions.documentId),
        eq(documents.organizationId, scope.organizationId),
      ),
    )
    .innerJoin(
      documentTypes,
      and(
        eq(documentTypes.id, documents.documentTypeId),
        eq(documentTypes.organizationId, scope.organizationId),
      ),
    )
    .where(
      and(
        eq(documentVersions.id, versionId),
        eq(documentVersions.organizationId, scope.organizationId),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function listDocumentCustodyEvents(
  db: Database,
  scope: TenantScope,
  versionId: string,
) {
  return db
    .select()
    .from(documentCustodyEvents)
    .where(
      and(
        eq(documentCustodyEvents.organizationId, scope.organizationId),
        eq(documentCustodyEvents.documentVersionId, versionId),
      ),
    )
    .orderBy(asc(documentCustodyEvents.occurredAt));
}

export async function listDocumentAccessEvents(
  db: Database,
  scope: TenantScope,
  versionId: string,
) {
  return db
    .select()
    .from(documentAccessEvents)
    .where(
      and(
        eq(documentAccessEvents.organizationId, scope.organizationId),
        eq(documentAccessEvents.documentVersionId, versionId),
      ),
    )
    .orderBy(desc(documentAccessEvents.createdAt));
}

export async function trustedCaseDocumentTypes(
  db: Database,
  scope: TenantScope,
  caseId: string,
): Promise<string[]> {
  const rows = await db
    .select({ type: documentTypes.key })
    .from(documentCaseLinks)
    .innerJoin(
      documentVersions,
      and(
        eq(documentVersions.id, documentCaseLinks.documentVersionId),
        eq(
          documentVersions.organizationId,
          documentCaseLinks.organizationId,
        ),
        eq(documentVersions.contentStatus, "available"),
        eq(documentVersions.malwareScanStatus, "clean"),
      ),
    )
    .innerJoin(
      documents,
      and(
        eq(documents.id, documentVersions.documentId),
        eq(documents.organizationId, documentCaseLinks.organizationId),
        eq(documents.status, "active"),
      ),
    )
    .innerJoin(
      documentTypes,
      and(
        eq(documentTypes.id, documents.documentTypeId),
        eq(documentTypes.organizationId, documentCaseLinks.organizationId),
        eq(documentTypes.status, "active"),
      ),
    )
    .where(
      and(
        eq(documentCaseLinks.organizationId, scope.organizationId),
        eq(documentCaseLinks.caseId, caseId),
      ),
    );

  return rows.map((row) => row.type);
}
