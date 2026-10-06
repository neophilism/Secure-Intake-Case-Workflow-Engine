import { and, eq, gt, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  authSessions,
  membershipRoles,
  organizationMemberships,
  organizations,
  rolePermissions,
  roles,
  userCredentials,
  users,
} from "@/db/schema";
import type { TenantScope } from "@/lib/tenancy";

export async function findActiveUserByEmail(
  db: Database,
  email: string,
) {
  const [user] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.email, email.trim().toLowerCase()),
        eq(users.status, "active"),
      ),
    )
    .limit(1);

  return user ?? null;
}

export async function findCredentialForUser(
  db: Database,
  userId: string,
) {
  const [credential] = await db
    .select()
    .from(userCredentials)
    .where(eq(userCredentials.userId, userId))
    .limit(1);

  return credential ?? null;
}

export async function listActiveMembershipsForUser(
  db: Database,
  userId: string,
) {
  return db
    .select({
      id: organizationMemberships.id,
      organizationId: organizationMemberships.organizationId,
      title: organizationMemberships.title,
      organizationName: organizations.name,
      organizationSlug: organizations.slug,
    })
    .from(organizationMemberships)
    .innerJoin(
      organizations,
      eq(organizationMemberships.organizationId, organizations.id),
    )
    .where(
      and(
        eq(organizationMemberships.userId, userId),
        eq(organizationMemberships.status, "active"),
        eq(organizations.status, "active"),
      ),
    );
}

export async function findActiveMembership(
  db: Database,
  userId: string,
  organizationId: string,
) {
  const [membership] = await db
    .select()
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.userId, userId),
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.status, "active"),
      ),
    )
    .limit(1);

  return membership ?? null;
}

export async function createAuthSession(
  db: Database,
  input: {
    userId: string;
    tokenHash: string;
    activeOrganizationId: string | null;
    expiresAt: Date;
  },
) {
  const [session] = await db
    .insert(authSessions)
    .values({
      userId: input.userId,
      tokenHash: input.tokenHash,
      activeOrganizationId: input.activeOrganizationId,
      expiresAt: input.expiresAt,
    })
    .returning();

  return session;
}

export async function findValidSessionByTokenHash(
  db: Database,
  tokenHash: string,
  now = new Date(),
) {
  const [session] = await db
    .select()
    .from(authSessions)
    .where(
      and(
        eq(authSessions.tokenHash, tokenHash),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, now),
      ),
    )
    .limit(1);

  return session ?? null;
}

export async function findActiveUserById(
  db: Database,
  userId: string,
) {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.status, "active")))
    .limit(1);

  return user ?? null;
}

export async function setSessionActiveOrganization(
  db: Database,
  sessionId: string,
  organizationId: string | null,
) {
  const [session] = await db
    .update(authSessions)
    .set({
      activeOrganizationId: organizationId,
      lastSeenAt: new Date(),
    })
    .where(eq(authSessions.id, sessionId))
    .returning();

  return session ?? null;
}

export async function revokeSession(
  db: Database,
  sessionId: string,
) {
  await db
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(eq(authSessions.id, sessionId));
}

export async function listMembershipAuthorization(
  db: Database,
  scope: TenantScope,
  membershipId: string,
) {
  const rows = await db
    .select({
      roleKey: roles.key,
      permission: rolePermissions.permission,
    })
    .from(membershipRoles)
    .innerJoin(
      roles,
      and(
        eq(membershipRoles.roleId, roles.id),
        eq(roles.organizationId, scope.organizationId),
      ),
    )
    .leftJoin(
      rolePermissions,
      and(
        eq(rolePermissions.roleId, roles.id),
        eq(rolePermissions.organizationId, scope.organizationId),
      ),
    )
    .where(
      and(
        eq(membershipRoles.organizationMembershipId, membershipId),
        eq(membershipRoles.organizationId, scope.organizationId),
      ),
    );

  return rows;
}
