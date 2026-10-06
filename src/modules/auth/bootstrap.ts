import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  organizationMemberships,
  organizations,
  userCredentials,
  users,
} from "@/db/schema";
import { createTrustedTenantScope } from "@/lib/tenancy";
import { assignRoleToMembership, ensureDefaultRoles } from "./default-roles";
import { hashPassword } from "./password";

export async function bootstrapOrganizationAdministrator(
  db: Database,
  input: {
    email: string;
    password: string;
    displayName?: string | null;
    organizationName: string;
    organizationSlug: string;
  },
) {
  const normalizedEmail = input.email.trim().toLowerCase();

  let [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, input.organizationSlug))
    .limit(1);

  if (!organization) {
    [organization] = await db
      .insert(organizations)
      .values({
        name: input.organizationName,
        slug: input.organizationSlug,
      })
      .returning();
  }

  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        displayName: input.displayName ?? null,
      })
      .returning();
  }

  const passwordHash = await hashPassword(input.password);
  await db
    .insert(userCredentials)
    .values({
      userId: user.id,
      passwordHash,
    })
    .onConflictDoUpdate({
      target: userCredentials.userId,
      set: {
        passwordHash,
        passwordUpdatedAt: new Date(),
      },
    });

  let [membership] = await db
    .select()
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, organization.id),
        eq(organizationMemberships.userId, user.id),
      ),
    )
    .limit(1);

  if (!membership) {
    [membership] = await db
      .insert(organizationMemberships)
      .values({
        organizationId: organization.id,
        userId: user.id,
        status: "active",
        title: "Administrator",
      })
      .returning();
  }

  const scope = createTrustedTenantScope(organization.id);
  await ensureDefaultRoles(db, scope);
  await assignRoleToMembership(
    db,
    scope,
    membership.id,
    "administrator",
  );

  return {
    organizationId: organization.id,
    userId: user.id,
    membershipId: membership.id,
  };
}
