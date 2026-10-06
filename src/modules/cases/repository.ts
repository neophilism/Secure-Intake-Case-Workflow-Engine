import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  caseStatusHistory,
  cases,
  caseTags,
  intakeForms,
  intakeFormVersions,
  intakeSubmissions,
} from "@/db/schema";
import type { TenantScope } from "@/lib/tenancy";

export async function listCases(
  db: Database,
  scope: TenantScope,
) {
  return db
    .select()
    .from(cases)
    .where(eq(cases.organizationId, scope.organizationId))
    .orderBy(desc(cases.updatedAt), desc(cases.createdAt));
}

export async function findCaseById(
  db: Database,
  scope: TenantScope,
  caseId: string,
) {
  const [record] = await db
    .select()
    .from(cases)
    .where(
      and(
        eq(cases.id, caseId),
        eq(cases.organizationId, scope.organizationId),
      ),
    )
    .limit(1);

  return record ?? null;
}

export async function listSubmittedIntakeAwaitingCase(
  db: Database,
  scope: TenantScope,
) {
  return db
    .select({
      submissionId: intakeSubmissions.id,
      confirmationCode: intakeSubmissions.confirmationCode,
      submittedAt: intakeSubmissions.submittedAt,
      formId: intakeForms.id,
      formName: intakeForms.name,
      formSlug: intakeForms.slug,
    })
    .from(intakeSubmissions)
    .innerJoin(
      intakeForms,
      and(
        eq(intakeForms.id, intakeSubmissions.formId),
        eq(
          intakeForms.organizationId,
          intakeSubmissions.organizationId,
        ),
      ),
    )
    .leftJoin(
      cases,
      eq(cases.sourceSubmissionId, intakeSubmissions.id),
    )
    .where(
      and(
        eq(
          intakeSubmissions.organizationId,
          scope.organizationId,
        ),
        eq(intakeSubmissions.status, "submitted"),
        isNull(cases.id),
      ),
    )
    .orderBy(asc(intakeSubmissions.submittedAt));
}

export async function listCaseStatusHistory(
  db: Database,
  scope: TenantScope,
  caseId: string,
) {
  return db
    .select()
    .from(caseStatusHistory)
    .where(
      and(
        eq(caseStatusHistory.organizationId, scope.organizationId),
        eq(caseStatusHistory.caseId, caseId),
      ),
    )
    .orderBy(asc(caseStatusHistory.createdAt));
}

export async function listCaseTags(
  db: Database,
  scope: TenantScope,
  caseId: string,
) {
  return db
    .select()
    .from(caseTags)
    .where(
      and(
        eq(caseTags.organizationId, scope.organizationId),
        eq(caseTags.caseId, caseId),
      ),
    )
    .orderBy(asc(caseTags.tag));
}

export async function findCaseSourceSubmission(
  db: Database,
  scope: TenantScope,
  caseId: string,
) {
  const [row] = await db
    .select({
      submissionId: intakeSubmissions.id,
      confirmationCode: intakeSubmissions.confirmationCode,
      submittedAt: intakeSubmissions.submittedAt,
      answers: intakeSubmissions.answers,
      formName: intakeForms.name,
      formSlug: intakeForms.slug,
      formVersion: intakeFormVersions.versionNumber,
    })
    .from(cases)
    .innerJoin(
      intakeSubmissions,
      and(
        eq(intakeSubmissions.id, cases.sourceSubmissionId),
        eq(
          intakeSubmissions.organizationId,
          cases.organizationId,
        ),
      ),
    )
    .innerJoin(
      intakeForms,
      and(
        eq(intakeForms.id, intakeSubmissions.formId),
        eq(intakeForms.organizationId, cases.organizationId),
      ),
    )
    .innerJoin(
      intakeFormVersions,
      and(
        eq(
          intakeFormVersions.id,
          intakeSubmissions.formVersionId,
        ),
        eq(
          intakeFormVersions.organizationId,
          cases.organizationId,
        ),
      ),
    )
    .where(
      and(
        eq(cases.id, caseId),
        eq(cases.organizationId, scope.organizationId),
      ),
    )
    .limit(1);

  return row ?? null;
}
