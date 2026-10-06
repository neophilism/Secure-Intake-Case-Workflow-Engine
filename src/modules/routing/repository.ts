import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  caseAssignmentHistory,
  caseQueues,
  caseRoutingRules,
  caseTeamMemberships,
  caseTeams,
  organizationMemberships,
  users,
} from "@/db/schema";
import type { TenantScope } from "@/lib/tenancy";
import { parseRoutingRuleDefinition } from "./definition";

export async function listTeams(db: Database, scope: TenantScope) {
  return db
    .select()
    .from(caseTeams)
    .where(eq(caseTeams.organizationId, scope.organizationId))
    .orderBy(asc(caseTeams.name));
}

export async function listQueues(db: Database, scope: TenantScope) {
  return db
    .select()
    .from(caseQueues)
    .where(eq(caseQueues.organizationId, scope.organizationId))
    .orderBy(asc(caseQueues.name));
}

export async function listRoutingRules(
  db: Database,
  scope: TenantScope,
) {
  const rows = await db
    .select()
    .from(caseRoutingRules)
    .where(eq(caseRoutingRules.organizationId, scope.organizationId))
    .orderBy(
      asc(caseRoutingRules.priority),
      asc(caseRoutingRules.createdAt),
    );

  return rows.map((row) => ({
    ...row,
    parsedDefinition: parseRoutingRuleDefinition(row.definition),
  }));
}

export async function listOrganizationMembers(
  db: Database,
  scope: TenantScope,
) {
  return db
    .select({
      membershipId: organizationMemberships.id,
      title: organizationMemberships.title,
      status: organizationMemberships.status,
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
    })
    .from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .where(
      and(
        eq(
          organizationMemberships.organizationId,
          scope.organizationId,
        ),
        eq(organizationMemberships.status, "active"),
        eq(users.status, "active"),
      ),
    )
    .orderBy(asc(users.displayName), asc(users.email));
}

export async function listTeamMembers(
  db: Database,
  scope: TenantScope,
  teamId?: string,
) {
  const conditions = [
    eq(caseTeamMemberships.organizationId, scope.organizationId),
  ];

  if (teamId) {
    conditions.push(eq(caseTeamMemberships.teamId, teamId));
  }

  return db
    .select({
      id: caseTeamMemberships.id,
      teamId: caseTeamMemberships.teamId,
      organizationMembershipId:
        caseTeamMemberships.organizationMembershipId,
      isAvailable: caseTeamMemberships.isAvailable,
      email: users.email,
      displayName: users.displayName,
      title: organizationMemberships.title,
    })
    .from(caseTeamMemberships)
    .innerJoin(
      organizationMemberships,
      and(
        eq(
          organizationMemberships.id,
          caseTeamMemberships.organizationMembershipId,
        ),
        eq(
          organizationMemberships.organizationId,
          scope.organizationId,
        ),
      ),
    )
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .where(and(...conditions))
    .orderBy(asc(users.displayName), asc(users.email));
}

export async function listCaseAssignmentHistory(
  db: Database,
  scope: TenantScope,
  caseId: string,
) {
  return db
    .select()
    .from(caseAssignmentHistory)
    .where(
      and(
        eq(caseAssignmentHistory.organizationId, scope.organizationId),
        eq(caseAssignmentHistory.caseId, caseId),
      ),
    )
    .orderBy(asc(caseAssignmentHistory.createdAt));
}
