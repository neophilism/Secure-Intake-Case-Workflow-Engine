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
  } else if (
    organization.status !== "active" ||
    organization.name !== input.organizationName
  ) {
    [organization] = await db
      .update(organizations)
      .set({
        name: input.organizationName,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organization.id))
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
  } else if (
    user.status !== "active" ||
    (input.displayName !== undefined &&
      user.displayName !== input.displayName)
  ) {
    [user] = await db
      .update(users)
      .set({
        status: "active",
        displayName:
          input.displayName !== undefined
            ? input.displayName
            : user.displayName,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
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
  } else if (
    membership.status !== "active" ||
    membership.title !== "Administrator"
  ) {
    [membership] = await db
      .update(organizationMemberships)
      .set({
        status: "active",
        title: "Administrator",
        updatedAt: new Date(),
      })
      .where(eq(organizationMemberships.id, membership.id))
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
