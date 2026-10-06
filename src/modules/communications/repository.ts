import { and, asc, desc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  caseCommunicationThreads,
  caseCorrespondenceMessages,
  caseNoteDocumentLinks,
  caseNotes,
  communicationTemplates,
  correspondenceMessageDocumentLinks,
  documentVersions,
  documents,
} from "@/db/schema";
import type { TenantScope } from "@/lib/tenancy";

export async function listCommunicationTemplates(
  db: Database,
  scope: TenantScope,
) {
  return db
    .select()
    .from(communicationTemplates)
    .where(
      eq(
        communicationTemplates.organizationId,
        scope.organizationId,
      ),
    )
    .orderBy(asc(communicationTemplates.name));
}

export async function listCaseNotes(
  db: Database,
  scope: TenantScope,
  caseId: string,
) {
  return db
    .select()
    .from(caseNotes)
    .where(
      and(
        eq(caseNotes.organizationId, scope.organizationId),
        eq(caseNotes.caseId, caseId),
        eq(caseNotes.status, "active"),
      ),
    )
    .orderBy(desc(caseNotes.createdAt));
}

export async function listCaseNoteAttachments(
  db: Database,
  scope: TenantScope,
  caseId: string,
) {
  return db
    .select({
      noteId: caseNoteDocumentLinks.noteId,
      version: documentVersions,
      document: documents,
    })
    .from(caseNoteDocumentLinks)
    .innerJoin(
      caseNotes,
      and(
        eq(caseNotes.id, caseNoteDocumentLinks.noteId),
        eq(
          caseNotes.organizationId,
          caseNoteDocumentLinks.organizationId,
        ),
        eq(caseNotes.caseId, caseId),
      ),
    )
    .innerJoin(
      documentVersions,
      and(
        eq(
          documentVersions.id,
          caseNoteDocumentLinks.documentVersionId,
        ),
        eq(
          documentVersions.organizationId,
          caseNoteDocumentLinks.organizationId,
        ),
      ),
    )
    .innerJoin(
      documents,
      and(
        eq(documents.id, documentVersions.documentId),
        eq(
          documents.organizationId,
          caseNoteDocumentLinks.organizationId,
        ),
      ),
    )
    .where(
      eq(
        caseNoteDocumentLinks.organizationId,
        scope.organizationId,
      ),
    )
    .orderBy(asc(caseNoteDocumentLinks.attachedAt));
}

export async function listCaseCorrespondence(
  db: Database,
  scope: TenantScope,
  caseId: string,
) {
  return db
    .select({
      message: caseCorrespondenceMessages,
      thread: caseCommunicationThreads,
    })
    .from(caseCorrespondenceMessages)
    .innerJoin(
      caseCommunicationThreads,
      and(
        eq(
          caseCommunicationThreads.id,
          caseCorrespondenceMessages.threadId,
        ),
        eq(
          caseCommunicationThreads.organizationId,
          caseCorrespondenceMessages.organizationId,
        ),
      ),
    )
    .where(
      and(
        eq(
          caseCorrespondenceMessages.organizationId,
          scope.organizationId,
        ),
        eq(caseCorrespondenceMessages.caseId, caseId),
      ),
    )
    .orderBy(desc(caseCorrespondenceMessages.createdAt));
}

export async function listCaseCorrespondenceAttachments(
  db: Database,
  scope: TenantScope,
  caseId: string,
) {
  return db
    .select({
      messageId: correspondenceMessageDocumentLinks.messageId,
      version: documentVersions,
      document: documents,
    })
    .from(correspondenceMessageDocumentLinks)
    .innerJoin(
      caseCorrespondenceMessages,
      and(
        eq(
          caseCorrespondenceMessages.id,
          correspondenceMessageDocumentLinks.messageId,
        ),
        eq(
          caseCorrespondenceMessages.organizationId,
          correspondenceMessageDocumentLinks.organizationId,
        ),
        eq(caseCorrespondenceMessages.caseId, caseId),
      ),
    )
    .innerJoin(
      documentVersions,
      and(
        eq(
          documentVersions.id,
          correspondenceMessageDocumentLinks.documentVersionId,
        ),
        eq(
          documentVersions.organizationId,
          correspondenceMessageDocumentLinks.organizationId,
        ),
      ),
    )
    .innerJoin(
      documents,
      and(
        eq(documents.id, documentVersions.documentId),
        eq(
          documents.organizationId,
          correspondenceMessageDocumentLinks.organizationId,
        ),
      ),
    )
    .where(
      eq(
        correspondenceMessageDocumentLinks.organizationId,
        scope.organizationId,
      ),
    )
    .orderBy(asc(correspondenceMessageDocumentLinks.attachedAt));
}
