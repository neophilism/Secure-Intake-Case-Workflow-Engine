import { randomUUID } from "node:crypto";
import {
  and,
  desc,
  eq,
  max,
} from "drizzle-orm";
import type {
  Database,
  DatabaseTransaction,
} from "@/db/client";
import {
  auditEvents,
  caseCorrespondenceMessages,
  caseNotes,
  caseReviews,
  cases,
  disclosurePublicationDocuments,
  disclosurePublications,
  disclosurePublicationVersions,
  documentDerivatives,
  documents,
  documentTypes,
  documentVersions,
  intakeSubmissions,
} from "@/db/schema";
import type { TenantScope } from "@/lib/tenancy";
import { auditEventValues } from "@/modules/audit/event";
import {
  configuredDocumentMaxBytes,
} from "@/modules/documents/service";
import { sha256Hex } from "@/modules/documents/hash";
import {
  documentStorageKey,
  getDocumentStorageAdapter,
  type DocumentStorageAdapter,
} from "@/modules/documents/storage";
import {
  isTrustedDocumentContent,
} from "@/modules/documents/policy";
import {
  disclosureSourceTypes,
  type DisclosureSourceType,
} from "./policy";
import {
  parsePublicData,
  type PublicJson,
} from "./public-data";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class DisclosureNotFoundError extends Error {
  constructor(message = "Disclosure record was not found.") {
    super(message);
    this.name = "DisclosureNotFoundError";
  }
}

export class DisclosureStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DisclosureStateError";
  }
}

export function parseDisclosureSourceType(
  value: string,
): DisclosureSourceType {
  if (
    !(disclosureSourceTypes as readonly string[]).includes(value)
  ) {
    throw new Error("Disclosure source type is invalid.");
  }
  return value as DisclosureSourceType;
}

export async function createDisclosurePublication(
  db: Database,
  scope: TenantScope,
  input: {
    sourceType: DisclosureSourceType;
    sourceId: string;
    slug: string;
    publicTitle: string;
    publicSummary?: string | null;
    publicData: unknown;
    redactionSummary?: string | null;
    actorUserId: string;
  },
) {
  const slug = normalizeSlug(input.slug);
  const publicTitle = normalizePublicTitle(input.publicTitle);
  const publicData = parsePublicData(input.publicData);

  return db.transaction(async (tx) => {
    await requireDisclosureSource(
      tx,
      scope,
      input.sourceType,
      input.sourceId,
    );

    const [publication] = await tx
      .insert(disclosurePublications)
      .values({
        organizationId: scope.organizationId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        slug,
        status: "draft",
        createdByUserId: input.actorUserId,
      })
      .returning();

    const [version] = await tx
      .insert(disclosurePublicationVersions)
      .values({
        organizationId: scope.organizationId,
        publicationId: publication.id,
        versionNumber: 1,
        publicTitle,
        publicSummary:
          input.publicSummary?.trim().slice(0, 5000) || null,
        publicData: publicData as Record<string, unknown>,
        redactionSummary:
          input.redactionSummary?.trim().slice(0, 5000) ||
          null,
        status: "draft",
        preparedByUserId: input.actorUserId,
      })
      .returning();

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId: input.actorUserId,
        action: "disclosure.publication_created",
        resourceType: "disclosure_publication",
        resourceId: publication.id,
        newState: {
          sourceType: publication.sourceType,
          sourceId: publication.sourceId,
          slug: publication.slug,
          status: publication.status,
          versionId: version.id,
          versionNumber: version.versionNumber,
        },
        metadata: publicRepresentationMetadata(
          publicTitle,
          publicData,
        ),
      }),
    );

    return { publication, version };
  });
}

export async function createDisclosureRevision(
  db: Database,
  scope: TenantScope,
  input: {
    publicationId: string;
    publicTitle: string;
    publicSummary?: string | null;
    publicData: unknown;
    redactionSummary?: string | null;
    actorUserId: string;
  },
) {
  const publicTitle = normalizePublicTitle(input.publicTitle);
  const publicData = parsePublicData(input.publicData);

  return db.transaction(async (tx) => {
    const publication = await requirePublication(
      tx,
      scope,
      input.publicationId,
    );
    await requireDisclosureSource(
      tx,
      scope,
      parseDisclosureSourceType(publication.sourceType),
      publication.sourceId,
    );

    const [latest] = await tx
      .select({
        maxVersion: max(
          disclosurePublicationVersions.versionNumber,
        ),
      })
      .from(disclosurePublicationVersions)
      .where(
        and(
          eq(
            disclosurePublicationVersions.organizationId,
            scope.organizationId,
          ),
          eq(
            disclosurePublicationVersions.publicationId,
            publication.id,
          ),
        ),
      );

    const [version] = await tx
      .insert(disclosurePublicationVersions)
      .values({
        organizationId: scope.organizationId,
        publicationId: publication.id,
        versionNumber: (latest?.maxVersion ?? 0) + 1,
        publicTitle,
        publicSummary:
          input.publicSummary?.trim().slice(0, 5000) || null,
        publicData: publicData as Record<string, unknown>,
        redactionSummary:
          input.redactionSummary?.trim().slice(0, 5000) ||
          null,
        status: "draft",
        preparedByUserId: input.actorUserId,
      })
      .returning();

    await tx
      .update(disclosurePublications)
      .set({ updatedAt: new Date() })
      .where(eq(disclosurePublications.id, publication.id));

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId: input.actorUserId,
        action: "disclosure.revision_created",
        resourceType: "disclosure_publication_version",
        resourceId: version.id,
        parentResourceType: "disclosure_publication",
        parentResourceId: publication.id,
        newState: {
          versionNumber: version.versionNumber,
          status: version.status,
        },
        metadata: publicRepresentationMetadata(
          publicTitle,
          publicData,
        ),
      }),
    );

    return version;
  });
}

export async function submitDisclosureVersion(
  db: Database,
  scope: TenantScope,
  input: {
    versionId: string;
    actorUserId: string;
  },
) {
  return transitionDisclosureVersion(db, scope, {
    versionId: input.versionId,
    expectedStatus: "draft",
    nextStatus: "submitted",
    actorUserId: input.actorUserId,
    action: "disclosure.submitted",
    patch: { submittedAt: new Date() },
  });
}

export async function reviewDisclosureVersion(
  db: Database,
  scope: TenantScope,
  input: {
    versionId: string;
    decision: "approved" | "rejected";
    reviewNote?: string | null;
    actorUserId: string;
  },
) {
  return db.transaction(async (tx) => {
    const version = await requirePublicationVersion(
      tx,
      scope,
      input.versionId,
    );
    if (version.status !== "submitted") {
      throw new DisclosureStateError(
        "Only a submitted disclosure can be reviewed.",
      );
    }
    if (version.preparedByUserId === input.actorUserId) {
      throw new DisclosureStateError(
        "Disclosure review requires a different user from the preparer.",
      );
    }

    if (input.decision === "approved") {
      await assertReleaseDocumentsTrusted(
        tx,
        scope,
        version.id,
      );
    }

    const now = new Date();
    const [updated] = await tx
      .update(disclosurePublicationVersions)
      .set({
        status: input.decision,
        reviewedByUserId: input.actorUserId,
        reviewNote:
          input.reviewNote?.trim().slice(0, 5000) || null,
        approvedAt:
          input.decision === "approved" ? now : null,
        updatedAt: now,
      })
      .where(
        and(
          eq(disclosurePublicationVersions.id, version.id),
          eq(
            disclosurePublicationVersions.organizationId,
            scope.organizationId,
          ),
          eq(
            disclosurePublicationVersions.status,
            "submitted",
          ),
        ),
      )
      .returning();

    if (!updated) {
      throw new DisclosureStateError(
        "Disclosure review state changed concurrently.",
      );
    }

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId: input.actorUserId,
        action:
          input.decision === "approved"
            ? "disclosure.approved"
            : "disclosure.rejected",
        resourceType: "disclosure_publication_version",
        resourceId: version.id,
        parentResourceType: "disclosure_publication",
        parentResourceId: version.publicationId,
        previousState: { status: version.status },
        newState: {
          status: updated.status,
          approvedAt:
            updated.approvedAt?.toISOString() ?? null,
        },
        metadata: {
          reviewNoteProvided: Boolean(
            input.reviewNote?.trim(),
          ),
        },
      }),
    );

    return updated;
  });
}

export async function publishDisclosureVersion(
  db: Database,
  scope: TenantScope,
  input: {
    versionId: string;
    actorUserId: string;
  },
) {
  return db.transaction(async (tx) => {
    const version = await requirePublicationVersion(
      tx,
      scope,
      input.versionId,
    );
    if (version.status !== "approved") {
      throw new DisclosureStateError(
        "Only an approved disclosure can be published.",
      );
    }

    await assertReleaseDocumentsTrusted(
      tx,
      scope,
      version.id,
    );

    const now = new Date();

    await tx
      .update(disclosurePublicationVersions)
      .set({
        status: "superseded",
        updatedAt: now,
      })
      .where(
        and(
          eq(
            disclosurePublicationVersions.organizationId,
            scope.organizationId,
          ),
          eq(
            disclosurePublicationVersions.publicationId,
            version.publicationId,
          ),
          eq(
            disclosurePublicationVersions.status,
            "published",
          ),
        ),
      );

    const [published] = await tx
      .update(disclosurePublicationVersions)
      .set({
        status: "published",
        publishedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(disclosurePublicationVersions.id, version.id),
          eq(
            disclosurePublicationVersions.organizationId,
            scope.organizationId,
          ),
          eq(
            disclosurePublicationVersions.status,
            "approved",
          ),
        ),
      )
      .returning();

    if (!published) {
      throw new DisclosureStateError(
        "Disclosure publication state changed concurrently.",
      );
    }

    await tx
      .update(disclosurePublications)
      .set({
        status: "published",
        updatedAt: now,
      })
      .where(
        and(
          eq(
            disclosurePublications.id,
            version.publicationId,
          ),
          eq(
            disclosurePublications.organizationId,
            scope.organizationId,
          ),
        ),
      );

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId: input.actorUserId,
        action: "disclosure.published",
        resourceType: "disclosure_publication_version",
        resourceId: version.id,
        parentResourceType: "disclosure_publication",
        parentResourceId: version.publicationId,
        previousState: { status: version.status },
        newState: {
          status: published.status,
          publishedAt:
            published.publishedAt?.toISOString() ?? null,
        },
      }),
    );

    return published;
  });
}

export async function withdrawDisclosurePublication(
  db: Database,
  scope: TenantScope,
  input: {
    publicationId: string;
    reason: string;
    actorUserId: string;
  },
) {
  const reason = input.reason.trim();
  if (!reason) {
    throw new DisclosureStateError(
      "Withdrawal reason is required.",
    );
  }

  return db.transaction(async (tx) => {
    const publication = await requirePublication(
      tx,
      scope,
      input.publicationId,
    );
    if (publication.status !== "published") {
      throw new DisclosureStateError(
        "Only a published disclosure can be withdrawn.",
      );
    }

    const now = new Date();
    const [updated] = await tx
      .update(disclosurePublications)
      .set({
        status: "withdrawn",
        updatedAt: now,
      })
      .where(
        and(
          eq(disclosurePublications.id, publication.id),
          eq(
            disclosurePublications.organizationId,
            scope.organizationId,
          ),
          eq(disclosurePublications.status, "published"),
        ),
      )
      .returning();

    if (!updated) {
      throw new DisclosureStateError(
        "Disclosure publication state changed concurrently.",
      );
    }

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId: input.actorUserId,
        action: "disclosure.withdrawn",
        resourceType: "disclosure_publication",
        resourceId: publication.id,
        previousState: { status: publication.status },
        newState: { status: updated.status },
        metadata: {
          reasonLength: reason.length,
        },
      }),
    );

    return updated;
  });
}

export async function createRedactedDocumentDerivative(
  db: Database,
  scope: TenantScope,
  input: {
    sourceDocumentVersionId: string;
    audience: "public" | "participant";
    title: string;
    description?: string | null;
    filename: string;
    mimeType: string;
    data: Uint8Array;
    redactionSummary?: string | null;
    actorUserId: string;
  },
  storage: DocumentStorageAdapter =
    getDocumentStorageAdapter(),
) {
  const source = await loadTrustedSourceDocument(
    db,
    scope,
    input.sourceDocumentVersionId,
  );

  const prepared = prepareDerivativeContent(
    input.data,
    input.filename,
    source.type.maxBytes,
  );
  const documentId = randomUUID();
  const versionId = randomUUID();
  const storageKey = documentStorageKey({
    organizationId: scope.organizationId,
    documentId,
    versionId,
  });

  await storage.put(storageKey, input.data);

  try {
    return await db.transaction(async (tx) => {
      const [document] = await tx
        .insert(documents)
        .values({
          id: documentId,
          organizationId: scope.organizationId,
          documentTypeId: source.type.id,
          title:
            input.title.trim().slice(0, 500) ||
            prepared.filename,
          description:
            input.description?.trim().slice(0, 5000) ||
            null,
          visibility: input.audience,
          status: "active",
          createdByUserId: input.actorUserId,
        })
        .returning();

      const [version] = await tx
        .insert(documentVersions)
        .values({
          id: versionId,
          organizationId: scope.organizationId,
          documentId: document.id,
          versionNumber: 1,
          originalFilename: prepared.filename,
          mimeType: input.mimeType.trim().toLowerCase(),
          sizeBytes: input.data.byteLength,
          sha256: prepared.sha256,
          storageDriver: storage.driver,
          storageKey,
          contentStatus: "quarantined",
          malwareScanStatus: "pending",
          uploadedByUserId: input.actorUserId,
        })
        .returning();

      const [derivative] = await tx
        .insert(documentDerivatives)
        .values({
          organizationId: scope.organizationId,
          sourceDocumentVersionId:
            source.version.id,
          derivativeDocumentVersionId: version.id,
          audience: input.audience,
          redactionSummary:
            input.redactionSummary?.trim().slice(0, 5000) ||
            null,
          createdByUserId: input.actorUserId,
        })
        .returning();

      await tx.insert(auditEvents).values(
        auditEventValues({
          organizationId: scope.organizationId,
          actorType: "user",
          actorUserId: input.actorUserId,
          action: "disclosure.derivative_created",
          resourceType: "document_derivative",
          resourceId: derivative.id,
          parentResourceType: "document_version",
          parentResourceId: source.version.id,
          newState: {
            audience: derivative.audience,
            derivativeDocumentVersionId:
              derivative.derivativeDocumentVersionId,
            contentStatus: version.contentStatus,
            malwareScanStatus: version.malwareScanStatus,
          },
          metadata: {
            sizeBytes: version.sizeBytes,
            mimeType: version.mimeType,
            redactionSummaryProvided: Boolean(
              input.redactionSummary?.trim(),
            ),
          },
        }),
      );

      return { derivative, document, version };
    });
  } catch (error) {
    await storage.remove(storageKey).catch(() => undefined);
    throw error;
  }
}

export async function attachDerivativeToDisclosureVersion(
  db: Database,
  scope: TenantScope,
  input: {
    publicationVersionId: string;
    documentDerivativeId: string;
    label?: string | null;
    sortOrder?: number;
    actorUserId: string;
  },
) {
  return db.transaction(async (tx) => {
    const version = await requirePublicationVersion(
      tx,
      scope,
      input.publicationVersionId,
    );
    if (version.status !== "draft") {
      throw new DisclosureStateError(
        "Documents can only be attached to a draft disclosure version.",
      );
    }

    const [derivative] = await tx
      .select()
      .from(documentDerivatives)
      .where(
        and(
          eq(
            documentDerivatives.id,
            input.documentDerivativeId,
          ),
          eq(
            documentDerivatives.organizationId,
            scope.organizationId,
          ),
        ),
      )
      .limit(1);

    if (!derivative || derivative.audience !== "public") {
      throw new DisclosureStateError(
        "Public disclosure versions may only attach public derivatives.",
      );
    }

    const [link] = await tx
      .insert(disclosurePublicationDocuments)
      .values({
        organizationId: scope.organizationId,
        publicationVersionId: version.id,
        documentDerivativeId: derivative.id,
        label: input.label?.trim().slice(0, 500) || null,
        sortOrder:
          Number.isInteger(input.sortOrder) &&
          (input.sortOrder ?? 0) >= 0
            ? input.sortOrder ?? 0
            : 0,
        attachedByUserId: input.actorUserId,
      })
      .onConflictDoNothing()
      .returning();

    if (!link) return null;

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId: input.actorUserId,
        action: "disclosure.derivative_attached",
        resourceType: "disclosure_publication_version",
        resourceId: version.id,
        parentResourceType: "disclosure_publication",
        parentResourceId: version.publicationId,
        metadata: {
          documentDerivativeId: derivative.id,
          sortOrder: link.sortOrder,
        },
      }),
    );

    return link;
  });
}

export async function detachDerivativeFromDisclosureVersion(
  db: Database,
  scope: TenantScope,
  input: {
    publicationVersionId: string;
    documentDerivativeId: string;
    actorUserId: string;
  },
) {
  return db.transaction(async (tx) => {
    const version = await requirePublicationVersion(
      tx,
      scope,
      input.publicationVersionId,
    );
    if (version.status !== "draft") {
      throw new DisclosureStateError(
        "Documents can only be detached from a draft disclosure version.",
      );
    }

    const [removed] = await tx
      .delete(disclosurePublicationDocuments)
      .where(
        and(
          eq(
            disclosurePublicationDocuments.organizationId,
            scope.organizationId,
          ),
          eq(
            disclosurePublicationDocuments.publicationVersionId,
            version.id,
          ),
          eq(
            disclosurePublicationDocuments.documentDerivativeId,
            input.documentDerivativeId,
          ),
        ),
      )
      .returning();

    if (!removed) return null;

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId: input.actorUserId,
        action: "disclosure.derivative_detached",
        resourceType: "disclosure_publication_version",
        resourceId: version.id,
        parentResourceType: "disclosure_publication",
        parentResourceId: version.publicationId,
        metadata: {
          documentDerivativeId:
            input.documentDerivativeId,
        },
      }),
    );

    return removed;
  });
}

async function transitionDisclosureVersion(
  db: Database,
  scope: TenantScope,
  input: {
    versionId: string;
    expectedStatus: string;
    nextStatus: string;
    actorUserId: string;
    action: string;
    patch?: Record<string, unknown>;
  },
) {
  return db.transaction(async (tx) => {
    const version = await requirePublicationVersion(
      tx,
      scope,
      input.versionId,
    );
    if (version.status !== input.expectedStatus) {
      throw new DisclosureStateError(
        `Disclosure must be ${input.expectedStatus} for this operation.`,
      );
    }

    const now = new Date();
    const [updated] = await tx
      .update(disclosurePublicationVersions)
      .set({
        status: input.nextStatus,
        ...(input.patch ?? {}),
        updatedAt: now,
      })
      .where(
        and(
          eq(disclosurePublicationVersions.id, version.id),
          eq(
            disclosurePublicationVersions.organizationId,
            scope.organizationId,
          ),
          eq(
            disclosurePublicationVersions.status,
            input.expectedStatus,
          ),
        ),
      )
      .returning();

    if (!updated) {
      throw new DisclosureStateError(
        "Disclosure state changed concurrently.",
      );
    }

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId: input.actorUserId,
        action: input.action,
        resourceType: "disclosure_publication_version",
        resourceId: version.id,
        parentResourceType: "disclosure_publication",
        parentResourceId: version.publicationId,
        previousState: { status: version.status },
        newState: { status: updated.status },
      }),
    );

    return updated;
  });
}

async function requirePublication(
  tx: DatabaseTransaction,
  scope: TenantScope,
  publicationId: string,
) {
  const [publication] = await tx
    .select()
    .from(disclosurePublications)
    .where(
      and(
        eq(disclosurePublications.id, publicationId),
        eq(
          disclosurePublications.organizationId,
          scope.organizationId,
        ),
      ),
    )
    .limit(1);

  if (!publication) throw new DisclosureNotFoundError();
  return publication;
}

async function requirePublicationVersion(
  tx: DatabaseTransaction,
  scope: TenantScope,
  versionId: string,
) {
  const [version] = await tx
    .select()
    .from(disclosurePublicationVersions)
    .where(
      and(
        eq(disclosurePublicationVersions.id, versionId),
        eq(
          disclosurePublicationVersions.organizationId,
          scope.organizationId,
        ),
      ),
    )
    .limit(1);

  if (!version) throw new DisclosureNotFoundError();
  return version;
}

async function requireDisclosureSource(
  tx: DatabaseTransaction,
  scope: TenantScope,
  sourceType: DisclosureSourceType,
  sourceId: string,
) {
  let found = false;

  switch (sourceType) {
    case "case": {
      const [row] = await tx
        .select({ id: cases.id })
        .from(cases)
        .where(
          and(
            eq(cases.id, sourceId),
            eq(cases.organizationId, scope.organizationId),
          ),
        )
        .limit(1);
      found = Boolean(row);
      break;
    }
    case "submission": {
      const [row] = await tx
        .select({ id: intakeSubmissions.id })
        .from(intakeSubmissions)
        .where(
          and(
            eq(intakeSubmissions.id, sourceId),
            eq(
              intakeSubmissions.organizationId,
              scope.organizationId,
            ),
          ),
        )
        .limit(1);
      found = Boolean(row);
      break;
    }
    case "document": {
      const [row] = await tx
        .select({ id: documents.id })
        .from(documents)
        .where(
          and(
            eq(documents.id, sourceId),
            eq(
              documents.organizationId,
              scope.organizationId,
            ),
          ),
        )
        .limit(1);
      found = Boolean(row);
      break;
    }
    case "note": {
      const [row] = await tx
        .select({ id: caseNotes.id })
        .from(caseNotes)
        .where(
          and(
            eq(caseNotes.id, sourceId),
            eq(caseNotes.organizationId, scope.organizationId),
          ),
        )
        .limit(1);
      found = Boolean(row);
      break;
    }
    case "correspondence": {
      const [row] = await tx
        .select({ id: caseCorrespondenceMessages.id })
        .from(caseCorrespondenceMessages)
        .where(
          and(
            eq(caseCorrespondenceMessages.id, sourceId),
            eq(
              caseCorrespondenceMessages.organizationId,
              scope.organizationId,
            ),
          ),
        )
        .limit(1);
      found = Boolean(row);
      break;
    }
    case "review": {
      const [row] = await tx
        .select({ id: caseReviews.id })
        .from(caseReviews)
        .where(
          and(
            eq(caseReviews.id, sourceId),
            eq(
              caseReviews.organizationId,
              scope.organizationId,
            ),
          ),
        )
        .limit(1);
      found = Boolean(row);
      break;
    }
  }

  if (!found) {
    throw new DisclosureNotFoundError(
      "Disclosure source was not found in the active organization.",
    );
  }
}

async function assertReleaseDocumentsTrusted(
  tx: DatabaseTransaction,
  scope: TenantScope,
  publicationVersionId: string,
) {
  const rows = await tx
    .select({
      derivative: documentDerivatives,
      document: documents,
      version: documentVersions,
    })
    .from(disclosurePublicationDocuments)
    .innerJoin(
      documentDerivatives,
      and(
        eq(
          documentDerivatives.id,
          disclosurePublicationDocuments.documentDerivativeId,
        ),
        eq(
          documentDerivatives.organizationId,
          disclosurePublicationDocuments.organizationId,
        ),
      ),
    )
    .innerJoin(
      documentVersions,
      and(
        eq(
          documentVersions.id,
          documentDerivatives.derivativeDocumentVersionId,
        ),
        eq(
          documentVersions.organizationId,
          disclosurePublicationDocuments.organizationId,
        ),
      ),
    )
    .innerJoin(
      documents,
      and(
        eq(documents.id, documentVersions.documentId),
        eq(
          documents.organizationId,
          disclosurePublicationDocuments.organizationId,
        ),
      ),
    )
    .where(
      and(
        eq(
          disclosurePublicationDocuments.organizationId,
          scope.organizationId,
        ),
        eq(
          disclosurePublicationDocuments.publicationVersionId,
          publicationVersionId,
        ),
      ),
    );

  for (const row of rows) {
    if (
      row.derivative.audience !== "public" ||
      row.document.visibility !== "public" ||
      row.document.status !== "active" ||
      !isTrustedDocumentContent(row.version)
    ) {
      throw new DisclosureStateError(
        "Every attached public derivative must be active, scan-clean, available, and classified public before approval/publication.",
      );
    }
  }
}

async function loadTrustedSourceDocument(
  db: Database,
  scope: TenantScope,
  sourceVersionId: string,
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
        eq(
          documents.organizationId,
          documentVersions.organizationId,
        ),
      ),
    )
    .innerJoin(
      documentTypes,
      and(
        eq(documentTypes.id, documents.documentTypeId),
        eq(
          documentTypes.organizationId,
          documentVersions.organizationId,
        ),
      ),
    )
    .where(
      and(
        eq(documentVersions.id, sourceVersionId),
        eq(
          documentVersions.organizationId,
          scope.organizationId,
        ),
        eq(documents.status, "active"),
        eq(documentTypes.status, "active"),
      ),
    )
    .limit(1);

  if (!row || !isTrustedDocumentContent(row.version)) {
    throw new DisclosureStateError(
      "Redacted derivatives require an active, trusted source document version.",
    );
  }
  return row;
}

function prepareDerivativeContent(
  data: Uint8Array,
  filename: string,
  typeMaxBytes: number | null,
) {
  if (data.byteLength < 1) {
    throw new Error("Derivative content is empty.");
  }

  const globalMax = configuredDocumentMaxBytes();
  if (
    data.byteLength > globalMax ||
    (typeMaxBytes !== null && data.byteLength > typeMaxBytes)
  ) {
    throw new Error(
      "Derivative exceeds the configured document size limit.",
    );
  }

  const sanitized = filename
    .trim()
    .replace(/[\\/\0]/g, "_")
    .slice(0, 240);
  if (!sanitized) {
    throw new Error("Derivative filename is required.");
  }

  return {
    filename: sanitized,
    sha256: sha256Hex(data),
  };
}

function normalizeSlug(value: string) {
  const slug = value.trim().toLowerCase();
  if (
    !slugPattern.test(slug) ||
    slug.length > 120
  ) {
    throw new Error(
      "Disclosure slug must use lowercase letters, numbers, and single hyphens.",
    );
  }
  return slug;
}

function normalizePublicTitle(value: string) {
  const title = value.trim();
  if (!title || title.length > 500) {
    throw new Error("Public title is required and must be at most 500 characters.");
  }
  return title;
}

function publicRepresentationMetadata(
  title: string,
  data: Record<string, PublicJson>,
) {
  return {
    publicTitleLength: title.length,
    publicDataKeys: Object.keys(data).sort(),
    publicDataBytes: Buffer.byteLength(
      JSON.stringify(data),
      "utf8",
    ),
  };
}
