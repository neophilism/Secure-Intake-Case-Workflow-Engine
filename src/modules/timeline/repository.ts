import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  caseAssignmentHistory,
  caseCorrespondenceMessages,
  caseDeadlineHistory,
  caseDeadlines,
  caseNotes,
  caseStatusHistory,
  documentCaseLinks,
  documentVersions,
  documents,
} from "@/db/schema";
import type { TenantScope } from "@/lib/tenancy";

export interface CaseTimelineItem {
  id: string;
  kind:
    | "status"
    | "assignment"
    | "deadline"
    | "document"
    | "note"
    | "correspondence";
  occurredAt: Date;
  title: string;
  detail: string | null;
  visibility: string | null;
}

export async function listCaseTimeline(
  db: Database,
  scope: TenantScope,
  caseId: string,
  options: {
    includeNotes: boolean;
    includeCorrespondence: boolean;
  },
): Promise<CaseTimelineItem[]> {
  const [
    statuses,
    assignments,
    deadlines,
    documentsAttached,
    notes,
    correspondence,
  ] = await Promise.all([
    db
      .select()
      .from(caseStatusHistory)
      .where(
        and(
          eq(caseStatusHistory.organizationId, scope.organizationId),
          eq(caseStatusHistory.caseId, caseId),
        ),
      ),
    db
      .select()
      .from(caseAssignmentHistory)
      .where(
        and(
          eq(
            caseAssignmentHistory.organizationId,
            scope.organizationId,
          ),
          eq(caseAssignmentHistory.caseId, caseId),
        ),
      ),
    db
      .select({
        history: caseDeadlineHistory,
        deadline: caseDeadlines,
      })
      .from(caseDeadlineHistory)
      .innerJoin(
        caseDeadlines,
        and(
          eq(caseDeadlines.id, caseDeadlineHistory.deadlineId),
          eq(
            caseDeadlines.organizationId,
            caseDeadlineHistory.organizationId,
          ),
          eq(caseDeadlines.caseId, caseId),
        ),
      )
      .where(
        eq(
          caseDeadlineHistory.organizationId,
          scope.organizationId,
        ),
      ),
    db
      .select({
        link: documentCaseLinks,
        version: documentVersions,
        document: documents,
      })
      .from(documentCaseLinks)
      .innerJoin(
        documentVersions,
        and(
          eq(
            documentVersions.id,
            documentCaseLinks.documentVersionId,
          ),
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
          eq(
            documents.organizationId,
            documentCaseLinks.organizationId,
          ),
        ),
      )
      .where(
        and(
          eq(documentCaseLinks.organizationId, scope.organizationId),
          eq(documentCaseLinks.caseId, caseId),
        ),
      ),
    options.includeNotes
      ? db
          .select()
          .from(caseNotes)
          .where(
            and(
              eq(caseNotes.organizationId, scope.organizationId),
              eq(caseNotes.caseId, caseId),
              eq(caseNotes.status, "active"),
            ),
          )
      : Promise.resolve([]),
    options.includeCorrespondence
      ? db
          .select()
          .from(caseCorrespondenceMessages)
          .where(
            and(
              eq(
                caseCorrespondenceMessages.organizationId,
                scope.organizationId,
              ),
              eq(caseCorrespondenceMessages.caseId, caseId),
            ),
          )
      : Promise.resolve([]),
  ]);

  const items: CaseTimelineItem[] = [];

  for (const entry of statuses) {
    items.push({
      id: `status:${entry.id}`,
      kind: "status",
      occurredAt: entry.createdAt,
      title: `${entry.fromStatus ?? "created"} → ${entry.toStatus}`,
      detail: entry.transitionKey
        ? `Workflow transition: ${entry.transitionKey}`
        : entry.note,
      visibility: "internal",
    });
  }

  for (const entry of assignments) {
    items.push({
      id: `assignment:${entry.id}`,
      kind: "assignment",
      occurredAt: entry.createdAt,
      title: `Assignment change — ${entry.source}`,
      detail: entry.reason,
      visibility: "internal",
    });
  }

  for (const { history, deadline } of deadlines) {
    items.push({
      id: `deadline:${history.id}`,
      kind: "deadline",
      occurredAt: history.occurredAt,
      title: `${deadline.label}: ${history.eventType}`,
      detail: history.reason,
      visibility: "internal",
    });
  }

  for (const { link, version, document } of documentsAttached) {
    items.push({
      id: `document:${link.id}`,
      kind: "document",
      occurredAt: link.attachedAt,
      title: `Document attached: ${document.title}`,
      detail: `Version ${version.versionNumber}; relationship ${link.relationship}`,
      visibility:
        document.visibility === "participant"
          ? "case_participants"
          : "internal",
    });
  }

  for (const note of notes) {
    items.push({
      id: `note:${note.id}`,
      kind: "note",
      occurredAt: note.createdAt,
      title: "Case note",
      detail: note.body,
      visibility: note.visibility,
    });
  }

  for (const message of correspondence) {
    items.push({
      id: `correspondence:${message.id}`,
      kind: "correspondence",
      occurredAt:
        message.receivedAt ??
        message.sentAt ??
        message.queuedAt ??
        message.createdAt,
      title: `${message.direction} ${message.channel} — ${message.status}`,
      detail: message.subject ?? message.body,
      visibility: message.visibility,
    });
  }

  return items.sort(
    (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
  );
}
