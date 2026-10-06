import { and, asc, desc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  caseDeadlineHistory,
  caseDeadlines,
  cases,
  deadlineCalendarExclusions,
  deadlineCalendars,
} from "@/db/schema";
import type { TenantScope } from "@/lib/tenancy";

export async function listDeadlineCalendars(
  db: Database,
  scope: TenantScope,
) {
  return db
    .select()
    .from(deadlineCalendars)
    .where(eq(deadlineCalendars.organizationId, scope.organizationId))
    .orderBy(asc(deadlineCalendars.name));
}

export async function listCalendarExclusions(
  db: Database,
  scope: TenantScope,
  calendarId: string,
) {
  return db
    .select()
    .from(deadlineCalendarExclusions)
    .where(
      and(
        eq(deadlineCalendarExclusions.organizationId, scope.organizationId),
        eq(deadlineCalendarExclusions.calendarId, calendarId),
      ),
    )
    .orderBy(asc(deadlineCalendarExclusions.localDate));
}

export async function listCaseDeadlines(
  db: Database,
  scope: TenantScope,
  caseId: string,
) {
  return db
    .select()
    .from(caseDeadlines)
    .where(
      and(
        eq(caseDeadlines.organizationId, scope.organizationId),
        eq(caseDeadlines.caseId, caseId),
      ),
    )
    .orderBy(desc(caseDeadlines.createdAt));
}

export async function listDeadlineHistory(
  db: Database,
  scope: TenantScope,
  deadlineId: string,
) {
  return db
    .select()
    .from(caseDeadlineHistory)
    .where(
      and(
        eq(caseDeadlineHistory.organizationId, scope.organizationId),
        eq(caseDeadlineHistory.deadlineId, deadlineId),
      ),
    )
    .orderBy(asc(caseDeadlineHistory.occurredAt));
}

export async function listDeadlineDashboard(
  db: Database,
  scope: TenantScope,
) {
  return db
    .select({
      deadline: caseDeadlines,
      case: {
        id: cases.id,
        caseNumber: cases.caseNumber,
        title: cases.title,
        priority: cases.priority,
        status: cases.status,
      },
    })
    .from(caseDeadlines)
    .innerJoin(
      cases,
      and(
        eq(cases.id, caseDeadlines.caseId),
        eq(cases.organizationId, caseDeadlines.organizationId),
      ),
    )
    .where(eq(caseDeadlines.organizationId, scope.organizationId))
    .orderBy(asc(caseDeadlines.dueAt));
}
