import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  disclosurePublicationDocuments,
  disclosurePublications,
  disclosurePublicationVersions,
  documentAccessEvents,
  documentDerivatives,
  documents,
  documentVersions,
  organizations,
} from "@/db/schema";
import { sha256Hex } from "@/modules/documents/hash";
import {
  getDocumentStorageAdapter,
  type DocumentStorageAdapter,
} from "@/modules/documents/storage";
import { isTrustedDocumentContent } from "@/modules/documents/policy";
import { parsePublicData } from "./public-data";

export async function getPublishedDisclosure(
  db: Database,
  organizationSlug: string,
  publicationSlug: string,
) {
  const [row] = await db
    .select({
      organization: {
        id: organizations.id,
        slug: organizations.slug,
        name: organizations.name,
      },
      publication: {
        id: disclosurePublications.id,
        slug: disclosurePublications.slug,
      },
      version: {
        id: disclosurePublicationVersions.id,
        publicTitle:
          disclosurePublicationVersions.publicTitle,
        publicSummary:
          disclosurePublicationVersions.publicSummary,
        publicData: disclosurePublicationVersions.publicData,
        publishedAt:
          disclosurePublicationVersions.publishedAt,
      },
    })
    .from(disclosurePublications)
    .innerJoin(
      organizations,
      and(
        eq(
          organizations.id,
          disclosurePublications.organizationId,
        ),
        eq(organizations.status, "active"),
      ),
    )
    .innerJoin(
      disclosurePublicationVersions,
      and(
        eq(
          disclosurePublicationVersions.publicationId,
          disclosurePublications.id,
        ),
        eq(
          disclosurePublicationVersions.organizationId,
          disclosurePublications.organizationId,
        ),
        eq(
          disclosurePublicationVersions.status,
          "published",
        ),
      ),
    )
    .where(
      and(
        eq(organizations.slug, organizationSlug),
        eq(
          disclosurePublications.slug,
          publicationSlug,
        ),
        eq(disclosurePublications.status, "published"),
      ),
    )
    .limit(1);

  if (!row) return null;

  const publicDocuments = await db
    .select({
      derivativeId: documentDerivatives.id,
      label: disclosurePublicationDocuments.label,
      sortOrder:
        disclosurePublicationDocuments.sortOrder,
      filename: documentVersions.originalFilename,
      mimeType: documentVersions.mimeType,
      sizeBytes: documentVersions.sizeBytes,
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
        eq(documentDerivatives.audience, "public"),
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
        eq(documentVersions.contentStatus, "available"),
        eq(documentVersions.malwareScanStatus, "clean"),
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
        eq(documents.visibility, "public"),
        eq(documents.status, "active"),
      ),
    )
    .where(
      and(
        eq(
          disclosurePublicationDocuments.organizationId,
          row.organization.id,
        ),
        eq(
          disclosurePublicationDocuments.publicationVersionId,
          row.version.id,
        ),
      ),
    )
    .orderBy(
      disclosurePublicationDocuments.sortOrder,
      disclosurePublicationDocuments.attachedAt,
    );

  return {
    organization: {
      slug: row.organization.slug,
      name: row.organization.name,
    },
    slug: row.publication.slug,
    title: row.version.publicTitle,
    summary: row.version.publicSummary,
    data: parsePublicData(row.version.publicData),
    publishedAt: row.version.publishedAt,
    documents: publicDocuments,
  };
}

export async function downloadPublishedDerivative(
  db: Database,
  input: {
    organizationSlug: string;
    publicationSlug: string;
    derivativeId: string;
  },
  storage: DocumentStorageAdapter =
    getDocumentStorageAdapter(),
) {
  const [row] = await db
    .select({
      organizationId: organizations.id,
      publicationId: disclosurePublications.id,
      publicationVersionId:
        disclosurePublicationVersions.id,
      derivativeId: documentDerivatives.id,
      document: documents,
      version: documentVersions,
    })
    .from(disclosurePublicationDocuments)
    .innerJoin(
      disclosurePublicationVersions,
      and(
        eq(
          disclosurePublicationVersions.id,
          disclosurePublicationDocuments.publicationVersionId,
        ),
        eq(
          disclosurePublicationVersions.organizationId,
          disclosurePublicationDocuments.organizationId,
        ),
        eq(
          disclosurePublicationVersions.status,
          "published",
        ),
      ),
    )
    .innerJoin(
      disclosurePublications,
      and(
        eq(
          disclosurePublications.id,
          disclosurePublicationVersions.publicationId,
        ),
        eq(
          disclosurePublications.organizationId,
          disclosurePublicationVersions.organizationId,
        ),
        eq(disclosurePublications.status, "published"),
      ),
    )
    .innerJoin(
      organizations,
      and(
        eq(
          organizations.id,
          disclosurePublications.organizationId,
        ),
        eq(organizations.status, "active"),
      ),
    )
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
        eq(documentDerivatives.audience, "public"),
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
        eq(documents.visibility, "public"),
        eq(documents.status, "active"),
      ),
    )
    .where(
      and(
        eq(organizations.slug, input.organizationSlug),
        eq(
          disclosurePublications.slug,
          input.publicationSlug,
        ),
        eq(documentDerivatives.id, input.derivativeId),
      ),
    )
    .limit(1);

  if (
    !row ||
    !isTrustedDocumentContent(row.version)
  ) {
    return null;
  }

  if (row.version.storageDriver !== storage.driver) {
    throw new Error(
      "Published derivative storage adapter is unavailable.",
    );
  }

  const data = await storage.get(row.version.storageKey);
  if (sha256Hex(data) !== row.version.sha256) {
    throw new Error(
      "Published derivative content hash mismatch.",
    );
  }

  await db.insert(documentAccessEvents).values({
    organizationId: row.organizationId,
    documentVersionId: row.version.id,
    action: "public_download",
    actorUserId: null,
    metadata: {
      publicationId: row.publicationId,
      publicationVersionId:
        row.publicationVersionId,
      derivativeId: row.derivativeId,
    },
  });

  return {
    data,
    filename: row.version.originalFilename,
    mimeType: row.version.mimeType,
    sizeBytes: row.version.sizeBytes,
    sha256: row.version.sha256,
  };
}
