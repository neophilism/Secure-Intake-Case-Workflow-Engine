import { and, asc, desc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  backgroundJobAttempts,
  backgroundJobs,
  backgroundSchedules,
} from "@/db/schema";
import type { TenantScope } from "@/lib/tenancy";

export async function listBackgroundJobs(
  db: Database,
  scope: TenantScope,
) {
  return db
    .select()
    .from(backgroundJobs)
    .where(eq(backgroundJobs.organizationId, scope.organizationId))
    .orderBy(desc(backgroundJobs.createdAt))
    .limit(250);
}

export async function listBackgroundSchedules(
  db: Database,
  scope: TenantScope,
) {
  return db
    .select()
    .from(backgroundSchedules)
    .where(
      eq(backgroundSchedules.organizationId, scope.organizationId),
    )
    .orderBy(asc(backgroundSchedules.key));
}

export async function listBackgroundJobAttempts(
  db: Database,
  scope: TenantScope,
  jobId: string,
) {
  return db
    .select()
    .from(backgroundJobAttempts)
    .where(
      and(
        eq(backgroundJobAttempts.organizationId, scope.organizationId),
        eq(backgroundJobAttempts.jobId, jobId),
      ),
    )
    .orderBy(asc(backgroundJobAttempts.attemptNumber));
}
