import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  caseReviewHistory,
  caseReviews,
  cases,
  membershipRoles,
  organizationMemberships,
  rolePermissions,
  reviewPolicies,
  reviewPolicyPrerequisites,
  users,
} from "@/db/schema";
import type { TenantScope } from "@/lib/tenancy";

export async function listReviewPolicies(
  db: Database,
  scope: TenantScope,
) {
  return db
    .select()
    .from(reviewPolicies)
    .where(eq(reviewPolicies.organizationId, scope.organizationId))
    .orderBy(asc(reviewPolicies.level), asc(reviewPolicies.name));
}

export async function listReviewPolicyPrerequisites(
  db: Database,
  scope: TenantScope,
) {
  return db
    .select({
      relation: reviewPolicyPrerequisites,
      prerequisite: {
        id: reviewPolicies.id,
        key: reviewPolicies.key,
        name: reviewPolicies.name,
        level: reviewPolicies.level,
      },
    })
    .from(reviewPolicyPrerequisites)
    .innerJoin(
      reviewPolicies,
      and(
        eq(
          reviewPolicies.id,
          reviewPolicyPrerequisites.prerequisitePolicyId,
        ),
        eq(
          reviewPolicies.organizationId,
          reviewPolicyPrerequisites.organizationId,
        ),
      ),
    )
    .where(
      eq(
        reviewPolicyPrerequisites.organizationId,
        scope.organizationId,
      ),
    )
    .orderBy(asc(reviewPolicies.level), asc(reviewPolicies.name));
}

export async function listCaseReviews(
  db: Database,
  scope: TenantScope,
  caseId: string,
) {
  return db
    .select()
    .from(caseReviews)
    .where(
      and(
        eq(caseReviews.organizationId, scope.organizationId),
        eq(caseReviews.caseId, caseId),
      ),
    )
    .orderBy(desc(caseReviews.filedAt));
}

export async function listCaseReviewHistory(
  db: Database,
  scope: TenantScope,
  reviewIds: readonly string[],
) {
  if (reviewIds.length === 0) return [];

  return db
    .select()
    .from(caseReviewHistory)
    .where(
      and(
        eq(
          caseReviewHistory.organizationId,
          scope.organizationId,
        ),
        inArray(caseReviewHistory.reviewId, [...reviewIds]),
      ),
    )
    .orderBy(asc(caseReviewHistory.occurredAt));
}

export async function listReviewHistory(
  db: Database,
  scope: TenantScope,
  reviewId: string,
) {
  return db
    .select()
    .from(caseReviewHistory)
    .where(
      and(
        eq(caseReviewHistory.organizationId, scope.organizationId),
        eq(caseReviewHistory.reviewId, reviewId),
      ),
    )
    .orderBy(asc(caseReviewHistory.occurredAt));
}

export async function listReviewDashboard(
  db: Database,
  scope: TenantScope,
) {
  return db
    .select({
      review: caseReviews,
      case: {
        id: cases.id,
        caseNumber: cases.caseNumber,
        title: cases.title,
        status: cases.status,
      },
      reviewer: {
        membershipId: organizationMemberships.id,
        displayName: users.displayName,
        email: users.email,
      },
    })
    .from(caseReviews)
    .innerJoin(
      cases,
      and(
        eq(cases.id, caseReviews.caseId),
        eq(cases.organizationId, caseReviews.organizationId),
      ),
    )
    .leftJoin(
      organizationMemberships,
      and(
        eq(
          organizationMemberships.id,
          caseReviews.reviewerMembershipId,
        ),
        eq(
          organizationMemberships.organizationId,
          caseReviews.organizationId,
        ),
      ),
    )
    .leftJoin(users, eq(users.id, organizationMemberships.userId))
    .where(eq(caseReviews.organizationId, scope.organizationId))
    .orderBy(desc(caseReviews.filedAt));
}

export async function findReviewById(
  db: Database,
  scope: TenantScope,
  reviewId: string,
) {
  const [review] = await db
    .select()
    .from(caseReviews)
    .where(
      and(
        eq(caseReviews.id, reviewId),
        eq(caseReviews.organizationId, scope.organizationId),
      ),
    )
    .limit(1);

  return review ?? null;
}


export async function listEligibleReviewers(
  db: Database,
  scope: TenantScope,
) {
  return db
    .selectDistinct({
      membershipId: organizationMemberships.id,
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      title: organizationMemberships.title,
    })
    .from(organizationMemberships)
    .innerJoin(
      users,
      and(
        eq(users.id, organizationMemberships.userId),
        eq(users.status, "active"),
      ),
    )
    .innerJoin(
      membershipRoles,
      and(
        eq(
          membershipRoles.organizationMembershipId,
          organizationMemberships.id,
        ),
        eq(
          membershipRoles.organizationId,
          scope.organizationId,
        ),
      ),
    )
    .innerJoin(
      rolePermissions,
      and(
        eq(rolePermissions.roleId, membershipRoles.roleId),
        eq(
          rolePermissions.organizationId,
          scope.organizationId,
        ),
        eq(rolePermissions.permission, "review:decide"),
      ),
    )
    .where(
      and(
        eq(
          organizationMemberships.organizationId,
          scope.organizationId,
        ),
        eq(organizationMemberships.status, "active"),
      ),
    )
    .orderBy(asc(users.displayName), asc(users.email));
}
