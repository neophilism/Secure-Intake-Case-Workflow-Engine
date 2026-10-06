import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  applicationManifestRevisions,
  applicationManagedResources,
  applicationProfiles,
  organizations,
} from "@/db/schema";
import type { TenantScope } from "@/lib/tenancy";

export async function findApplicationProfile(
  db: Database,
  scope: TenantScope,
) {
  const [profile] = await db
    .select()
    .from(applicationProfiles)
    .where(
      eq(applicationProfiles.organizationId, scope.organizationId),
    )
    .limit(1);

  return profile ?? null;
}

export async function findApplicationProfileByOrganizationSlug(
  db: Database,
  organizationSlug: string,
) {
  const [row] = await db
    .select({
      organization: {
        id: organizations.id,
        slug: organizations.slug,
        name: organizations.name,
      },
      profile: applicationProfiles,
    })
    .from(organizations)
    .leftJoin(
      applicationProfiles,
      eq(applicationProfiles.organizationId, organizations.id),
    )
    .where(
      and(
        eq(organizations.slug, organizationSlug),
        eq(organizations.status, "active"),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function listApplicationManifestRevisions(
  db: Database,
  scope: TenantScope,
  limit = 50,
) {
  return db
    .select()
    .from(applicationManifestRevisions)
    .where(
      eq(
        applicationManifestRevisions.organizationId,
        scope.organizationId,
      ),
    )
    .orderBy(desc(applicationManifestRevisions.appliedAt))
    .limit(Math.min(Math.max(limit, 1), 200));
}

export async function listApplicationManagedResources(
  db: Database,
  scope: TenantScope,
) {
  return db
    .select()
    .from(applicationManagedResources)
    .where(
      eq(
        applicationManagedResources.organizationId,
        scope.organizationId,
      ),
    )
    .orderBy(
      applicationManagedResources.resourceType,
      applicationManagedResources.resourceKey,
    );
}


export async function findActiveApplicationManifestRevision(
  db: Database,
  scope: TenantScope,
) {
  const [revision] = await db
    .select()
    .from(applicationManifestRevisions)
    .where(
      and(
        eq(
          applicationManifestRevisions.organizationId,
          scope.organizationId,
        ),
        eq(applicationManifestRevisions.status, "active"),
      ),
    )
    .limit(1);

  return revision ?? null;
}
