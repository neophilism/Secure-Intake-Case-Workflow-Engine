import { and, asc, desc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  disclosurePublicationDocuments,
  disclosurePublications,
  disclosurePublicationVersions,
  documentDerivatives,
  documents,
  documentVersions,
  organizations,
} from "@/db/schema";
import type { TenantScope } from "@/lib/tenancy";

export async function listDisclosurePublications(
  db: Database,
  scope: TenantScope,
) {
  return db
    .select()
    .from(disclosurePublications)
    .where(
      eq(
        disclosurePublications.organizationId,
        scope.organizationId,
      ),
    )
    .orderBy(desc(disclosurePublications.updatedAt));
}

export async function listDisclosurePublicationVersions(
  db: Database,
  scope: TenantScope,
  publicationId?: string,
) {
  const conditions = [
    eq(
      disclosurePublicationVersions.organizationId,
      scope.organizationId,
    ),
  ];

  if (publicationId) {
    conditions.push(
      eq(
        disclosurePublicationVersions.publicationId,
        publicationId,
      ),
    );
  }

  return db
    .select()
    .from(disclosurePublicationVersions)
    .where(and(...conditions))
    .orderBy(
      asc(disclosurePublicationVersions.publicationId),
      desc(disclosurePublicationVersions.versionNumber),
    );
}

export async function listDocumentDerivatives(
  db: Database,
  scope: TenantScope,
) {
  return db
    .select({
      derivative: documentDerivatives,
      derivedDocument: {
        id: documents.id,
        title: documents.title,
        visibility: documents.visibility,
        status: documents.status,
      },
      derivedVersion: {
        id: documentVersions.id,
        originalFilename: documentVersions.originalFilename,
        mimeType: documentVersions.mimeType,
        sizeBytes: documentVersions.sizeBytes,
        sha256: documentVersions.sha256,
        contentStatus: documentVersions.contentStatus,
        malwareScanStatus:
          documentVersions.malwareScanStatus,
      },
    })
    .from(documentDerivatives)
    .innerJoin(
      documentVersions,
      and(
        eq(
          documentVersions.id,
          documentDerivatives.derivativeDocumentVersionId,
        ),
        eq(
          documentVersions.organizationId,
          documentDerivatives.organizationId,
        ),
      ),
    )
    .innerJoin(
      documents,
      and(
        eq(documents.id, documentVersions.documentId),
        eq(
          documents.organizationId,
          documentDerivatives.organizationId,
        ),
      ),
    )
    .where(
      eq(
        documentDerivatives.organizationId,
        scope.organizationId,
      ),
    )
    .orderBy(desc(documentDerivatives.createdAt));
}

export async function listDisclosurePublicationDocuments(
  db: Database,
  scope: TenantScope,
  publicationVersionId?: string,
) {
  const conditions = [
    eq(
      disclosurePublicationDocuments.organizationId,
      scope.organizationId,
    ),
  ];
  if (publicationVersionId) {
    conditions.push(
      eq(
        disclosurePublicationDocuments.publicationVersionId,
        publicationVersionId,
      ),
    );
  }

  return db
    .select({
      link: disclosurePublicationDocuments,
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
    .where(and(...conditions))
    .orderBy(
      asc(disclosurePublicationDocuments.sortOrder),
      asc(disclosurePublicationDocuments.attachedAt),
    );
}


export async function getDisclosureOrganization(
  db: Database,
  scope: TenantScope,
) {
  const [organization] = await db
    .select({
      id: organizations.id,
      slug: organizations.slug,
      name: organizations.name,
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, scope.organizationId),
        eq(organizations.status, "active"),
      ),
    )
    .limit(1);

  return organization ?? null;
}
