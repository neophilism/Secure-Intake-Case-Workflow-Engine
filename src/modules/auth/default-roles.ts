import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  membershipRoles,
  organizationMemberships,
  rolePermissions,
  roles,
} from "@/db/schema";
import type { TenantScope } from "@/lib/tenancy";
import { defaultRoleTemplates } from "./permissions";

export async function ensureDefaultRoles(
  db: Database,
  scope: TenantScope,
) {
  for (const template of defaultRoleTemplates) {
    await db
      .insert(roles)
      .values({
        organizationId: scope.organizationId,
        key: template.key,
        name: template.name,
        description: template.description,
        isSystem: true,
      })
      .onConflictDoNothing();

    const [role] = await db
      .select()
      .from(roles)
      .where(
        and(
          eq(roles.organizationId, scope.organizationId),
          eq(roles.key, template.key),
        ),
      )
      .limit(1);

    if (!role) {
      throw new Error(`Unable to initialize role: ${template.key}`);
    }

    if (template.permissions.length > 0) {
      await db
        .insert(rolePermissions)
        .values(
          template.permissions.map((permission) => ({
            organizationId: scope.organizationId,
            roleId: role.id,
            permission,
          })),
        )
        .onConflictDoNothing();
    }
  }
}

export async function assignRoleToMembership(
  db: Database,
  scope: TenantScope,
  membershipId: string,
  roleKey: string,
) {
  const [[membership], [role]] = await Promise.all([
    db
      .select()
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.id, membershipId),
          eq(
            organizationMemberships.organizationId,
            scope.organizationId,
          ),
        ),
      )
      .limit(1),
    db
      .select()
      .from(roles)
      .where(
        and(
          eq(roles.organizationId, scope.organizationId),
          eq(roles.key, roleKey),
        ),
      )
      .limit(1),
  ]);

  if (!membership || !role) {
    throw new Error(
      "Membership and role must both exist in the active organization.",
    );
  }

  const [assignment] = await db
    .insert(membershipRoles)
    .values({
      organizationId: scope.organizationId,
      organizationMembershipId: membership.id,
      roleId: role.id,
    })
    .onConflictDoNothing()
    .returning();

  return assignment ?? null;
}
