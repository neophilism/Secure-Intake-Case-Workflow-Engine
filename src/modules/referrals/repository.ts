import { and, asc, desc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  caseDeadlines,
  caseReferralEvents,
  caseReferralPolicies,
  caseReferrals,
  cases,
} from "@/db/schema";
import type { TenantScope } from "@/lib/tenancy";

export async function listReferralPolicies(
  db: Database,
  scope: TenantScope,
) {
  return db
    .select()
    .from(caseReferralPolicies)
    .where(
      and(
        eq(
          caseReferralPolicies.organizationId,
          scope.organizationId,
        ),
        eq(caseReferralPolicies.status, "active"),
      ),
    )
    .orderBy(asc(caseReferralPolicies.name));
}

export async function findReferralPolicyByKey(
  db: Database,
  scope: TenantScope,
  key: string,
) {
  const [row] = await db
    .select()
    .from(caseReferralPolicies)
    .where(
      and(
        eq(
          caseReferralPolicies.organizationId,
          scope.organizationId,
        ),
        eq(caseReferralPolicies.key, key),
        eq(caseReferralPolicies.status, "active"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listCaseReferrals(
  db: Database,
  scope: TenantScope,
  caseId: string,
) {
  return db
    .select({
      referral: caseReferrals,
      policy: caseReferralPolicies,
    })
    .from(caseReferrals)
    .innerJoin(
      caseReferralPolicies,
      and(
        eq(caseReferralPolicies.id, caseReferrals.policyId),
        eq(
          caseReferralPolicies.organizationId,
          caseReferrals.organizationId,
        ),
      ),
    )
    .where(
      and(
        eq(caseReferrals.organizationId, scope.organizationId),
        eq(caseReferrals.caseId, caseId),
      ),
    )
    .orderBy(desc(caseReferrals.createdAt));
}

export async function findCaseReferral(
  db: Database,
  scope: TenantScope,
  referralId: string,
) {
  const [row] = await db
    .select({
      referral: caseReferrals,
      case: {
        id: cases.id,
        caseNumber: cases.caseNumber,
        title: cases.title,
      },
    })
    .from(caseReferrals)
    .innerJoin(
      cases,
      and(
        eq(cases.id, caseReferrals.caseId),
        eq(cases.organizationId, caseReferrals.organizationId),
      ),
    )
    .where(
      and(
        eq(caseReferrals.organizationId, scope.organizationId),
        eq(caseReferrals.id, referralId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listReferralEvents(
  db: Database,
  scope: TenantScope,
  referralId: string,
) {
  return db
    .select()
    .from(caseReferralEvents)
    .where(
      and(
        eq(
          caseReferralEvents.organizationId,
          scope.organizationId,
        ),
        eq(caseReferralEvents.referralId, referralId),
      ),
    )
    .orderBy(asc(caseReferralEvents.occurredAt));
}

export async function listReferralDeadlines(
  db: Database,
  scope: TenantScope,
  referralId: string,
) {
  return db
    .select()
    .from(caseDeadlines)
    .where(
      and(
        eq(caseDeadlines.organizationId, scope.organizationId),
        eq(caseDeadlines.referralId, referralId),
      ),
    )
    .orderBy(asc(caseDeadlines.dueAt));
}

export async function listReferralDashboard(
  db: Database,
  scope: TenantScope,
) {
  return db
    .select({
      referral: caseReferrals,
      case: {
        id: cases.id,
        caseNumber: cases.caseNumber,
        title: cases.title,
        status: cases.status,
        priority: cases.priority,
      },
      policy: {
        key: caseReferralPolicies.key,
        name: caseReferralPolicies.name,
      },
    })
    .from(caseReferrals)
    .innerJoin(
      cases,
      and(
        eq(cases.id, caseReferrals.caseId),
        eq(cases.organizationId, caseReferrals.organizationId),
      ),
    )
    .innerJoin(
      caseReferralPolicies,
      and(
        eq(caseReferralPolicies.id, caseReferrals.policyId),
        eq(
          caseReferralPolicies.organizationId,
          caseReferrals.organizationId,
        ),
      ),
    )
    .where(eq(caseReferrals.organizationId, scope.organizationId))
    .orderBy(desc(caseReferrals.updatedAt));
}
