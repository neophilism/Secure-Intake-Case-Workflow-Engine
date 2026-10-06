import type { Database } from "@/db/client";
import { createTrustedTenantScope } from "@/lib/tenancy";
import { env } from "@/lib/env";
import type { AuthorizationContext } from "./authorization";
import {
  createAuthSession,
  findActiveMembership,
  findActiveUserByEmail,
  findActiveUserById,
  findCredentialForUser,
  findValidSessionByTokenHash,
  listActiveMembershipsForUser,
  listMembershipAuthorization,
  revokeSession,
  setSessionActiveOrganization,
} from "./repository";
import { verifyPassword } from "./password";
import {
  createSessionToken,
  hashSessionToken,
} from "./session-token";

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email address or password.");
    this.name = "InvalidCredentialsError";
  }
}

export interface NewSession {
  token: string;
  expiresAt: Date;
  activeOrganizationId: string | null;
}

export async function authenticateWithLocalPassword(
  db: Database,
  email: string,
  password: string,
): Promise<NewSession> {
  const user = await findActiveUserByEmail(db, email);
  if (!user) {
    throw new InvalidCredentialsError();
  }

  const credential = await findCredentialForUser(db, user.id);
  if (!credential) {
    throw new InvalidCredentialsError();
  }

  const valid = await verifyPassword(password, credential.passwordHash);
  if (!valid) {
    throw new InvalidCredentialsError();
  }

  return createSessionForUser(db, user.id);
}

export async function createSessionForUser(
  db: Database,
  userId: string,
): Promise<NewSession> {
  const user = await findActiveUserById(db, userId);
  if (!user) {
    throw new InvalidCredentialsError();
  }

  const memberships = await listActiveMembershipsForUser(db, user.id);
  const activeOrganizationId =
    memberships.length === 1 ? memberships[0].organizationId : null;

  const token = createSessionToken();
  const expiresAt = new Date(
    Date.now() + env.AUTH_SESSION_TTL_HOURS * 60 * 60 * 1000,
  );

  await createAuthSession(db, {
    userId: user.id,
    tokenHash: hashSessionToken(token),
    activeOrganizationId,
    expiresAt,
  });

  return { token, expiresAt, activeOrganizationId };
}

export async function resolveAuthorizationContext(
  db: Database,
  token: string,
): Promise<AuthorizationContext | null> {
  const session = await findValidSessionByTokenHash(
    db,
    hashSessionToken(token),
  );
  if (!session) return null;

  const user = await findActiveUserById(db, session.userId);
  if (!user) return null;

  if (!session.activeOrganizationId) {
    return {
      sessionId: session.id,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
      membership: null,
      tenantScope: null,
      permissions: new Set<string>(),
      roleKeys: [],
    };
  }

  const membership = await findActiveMembership(
    db,
    user.id,
    session.activeOrganizationId,
  );

  if (!membership) {
    await setSessionActiveOrganization(db, session.id, null);
    return {
      sessionId: session.id,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
      membership: null,
      tenantScope: null,
      permissions: new Set<string>(),
      roleKeys: [],
    };
  }

  const scope = createTrustedTenantScope(membership.organizationId);
  const grants = await listMembershipAuthorization(
    db,
    scope,
    membership.id,
  );

  return {
    sessionId: session.id,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    },
    membership: {
      id: membership.id,
      organizationId: membership.organizationId,
      title: membership.title,
    },
    tenantScope: scope,
    permissions: new Set(
      grants
        .map((grant) => grant.permission)
        .filter((permission): permission is string => Boolean(permission)),
    ),
    roleKeys: [...new Set(grants.map((grant) => grant.roleKey))],
  };
}

export async function selectActiveOrganization(
  db: Database,
  token: string,
  organizationId: string,
): Promise<void> {
  const tokenHash = hashSessionToken(token);
  const session = await findValidSessionByTokenHash(db, tokenHash);
  if (!session) {
    throw new InvalidCredentialsError();
  }

  const membership = await findActiveMembership(
    db,
    session.userId,
    organizationId,
  );
  if (!membership) {
    throw new InvalidCredentialsError();
  }

  await setSessionActiveOrganization(db, session.id, organizationId);
}

export async function logoutSession(
  db: Database,
  token: string,
): Promise<void> {
  const session = await findValidSessionByTokenHash(
    db,
    hashSessionToken(token),
  );
  if (!session) return;

  await revokeSession(db, session.id);
}
