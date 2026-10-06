import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  offices,
  organizationInvitations,
  organizationMemberships,
} from "@/db/schema";
import type { TenantScope } from "@/lib/tenancy";

export async function listOffices(db: Database, scope: TenantScope) {
  return db
    .select()
    .from(offices)
    .where(eq(offices.organizationId, scope.organizationId))
    .orderBy(asc(offices.name));
}

export async function findOfficeById(
  db: Database,
  scope: TenantScope,
  officeId: string,
) {
  const [office] = await db
    .select()
    .from(offices)
    .where(
      and(
        eq(offices.id, officeId),
        eq(offices.organizationId, scope.organizationId),
      ),
    )
    .limit(1);

  return office ?? null;
}

export async function createOffice(
  db: Database,
  scope: TenantScope,
  input: {
    name: string;
    slug: string;
    parentOfficeId?: string | null;
  },
) {
  if (input.parentOfficeId) {
    const parent = await findOfficeById(db, scope, input.parentOfficeId);
    if (!parent) {
      throw new Error("Parent office was not found in the active organization.");
    }
  }

  const [office] = await db
    .insert(offices)
    .values({
      organizationId: scope.organizationId,
      name: input.name,
      slug: input.slug,
      parentOfficeId: input.parentOfficeId ?? null,
    })
    .returning();

  return office;
}

export async function listOrganizationMemberships(
  db: Database,
  scope: TenantScope,
) {
  return db
    .select()
    .from(organizationMemberships)
    .where(
      eq(organizationMemberships.organizationId, scope.organizationId),
    );
}

export async function createOrganizationInvitation(
  db: Database,
  scope: TenantScope,
  input: {
    email: string;
    tokenHash: string;
    expiresAt: Date;
  },
) {
  const [invitation] = await db
    .insert(organizationInvitations)
    .values({
      organizationId: scope.organizationId,
      email: input.email.trim().toLowerCase(),
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
    })
    .returning();

  return invitation;
}
