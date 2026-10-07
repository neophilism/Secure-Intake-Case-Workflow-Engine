import type {
  Database,
  DatabaseTransaction,
} from "@/db/client";
import type { TenantScope } from "@/lib/tenancy";
import {
  enqueueBackgroundJob,
  enqueueBackgroundJobInTransaction,
} from "@/modules/jobs/service";

export async function enqueueDocumentScanInTransaction(
  tx: DatabaseTransaction,
  scope: TenantScope,
  versionId: string,
) {
  return enqueueBackgroundJobInTransaction(tx, scope, {
    jobType: "document.scan",
    payload: { versionId },
    priority: 10,
    dedupeKey: `document-scan:${versionId}`,
    maxAttempts: 5,
  });
}

export async function enqueueDocumentScan(
  db: Database,
  scope: TenantScope,
  versionId: string,
) {
  return enqueueBackgroundJob(db, scope, {
    jobType: "document.scan",
    payload: { versionId },
    priority: 10,
    dedupeKey: `document-scan:${versionId}`,
    maxAttempts: 5,
  });
}
