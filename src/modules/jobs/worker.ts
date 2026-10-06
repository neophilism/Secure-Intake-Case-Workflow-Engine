import type { Database } from "@/db/client";
import type { TenantScope } from "@/lib/tenancy";
import { createTrustedTenantScope } from "@/lib/tenancy";
import { sweepOrganizationDeadlines } from "@/modules/deadlines/service";
import {
  claimBackgroundJobs,
  completeBackgroundJob,
  enqueueDueSchedules,
  failBackgroundJob,
  renewBackgroundJobLease,
  type ClaimedJob,
} from "./service";

export interface BackgroundJobHandlerContext {
  db: Database;
  scope: TenantScope;
  job: ClaimedJob;
  finalAttempt: boolean;
}

export type BackgroundJobHandler = (
  context: BackgroundJobHandlerContext,
) => Promise<void>;

export type BackgroundJobHandlers = ReadonlyMap<
  string,
  BackgroundJobHandler
>;

export function createCoreBackgroundJobHandlers(): Map<
  string,
  BackgroundJobHandler
> {
  return new Map([
    [
      "deadline.sweep",
      async ({ db, scope }) => {
        await sweepOrganizationDeadlines(db, scope);
      },
    ],
  ]);
}

export async function runBackgroundWorkerIteration(
  db: Database,
  handlers: BackgroundJobHandlers,
  input: {
    workerId: string;
    batchSize: number;
    leaseSeconds: number;
    now?: Date;
    organizationId?: string;
  },
) {
  const now = input.now ?? new Date();
  const scheduled = await enqueueDueSchedules(
    db,
    now,
    input.organizationId,
  );
  const acceptedTypes = [...handlers.keys()];

  const jobs = await claimBackgroundJobs(db, {
    workerId: input.workerId,
    acceptedTypes,
    limit: input.batchSize,
    leaseSeconds: input.leaseSeconds,
    now,
    organizationId: input.organizationId,
  });

  let succeeded = 0;
  let failed = 0;

  for (const job of jobs) {
    const handler = handlers.get(job.jobType);
    if (!handler) continue;

    const scope = createTrustedTenantScope(job.organizationId);

    const heartbeatMs = Math.max(
      1000,
      Math.floor((input.leaseSeconds * 1000) / 2),
    );
    const heartbeat = setInterval(() => {
      void renewBackgroundJobLease(
        db,
        job.id,
        input.workerId,
        input.leaseSeconds,
      ).catch(() => {
        // Completion/failure will detect lost lease ownership.
      });
    }, heartbeatMs);

    try {
      await handler({
        db,
        scope,
        job,
        finalAttempt: job.attemptNumber >= job.maxAttempts,
      });
      await completeBackgroundJob(
        db,
        job,
        input.workerId,
        new Date(),
      );
      succeeded += 1;
    } catch (error) {
      await failBackgroundJob(
        db,
        job,
        input.workerId,
        error,
        new Date(),
      );
      failed += 1;
    } finally {
      clearInterval(heartbeat);
    }
  }

  return {
    scheduled,
    claimed: jobs.length,
    succeeded,
    failed,
  };
}
