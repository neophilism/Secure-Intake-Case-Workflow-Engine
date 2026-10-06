import { and, desc, eq, inArray } from "drizzle-orm";
import type {
  Database,
  DatabaseTransaction,
} from "@/db/client";
import {
  protectedRevealRequests,
  submissionProtectedCompartments,
} from "@/db/schema";
import type { TenantScope } from "@/lib/tenancy";

type DbExecutor = Database | DatabaseTransaction;

export async function listProtectedCompartmentsForSubmission(
  db: DbExecutor,
  scope: TenantScope,
  submissionId: string,
) {
  return db
    .select({
      id: submissionProtectedCompartments.id,
      submissionId: submissionProtectedCompartments.submissionId,
      compartmentKey: submissionProtectedCompartments.compartmentKey,
      fieldIds: submissionProtectedCompartments.fieldIds,
      createdAt: submissionProtectedCompartments.createdAt,
      updatedAt: submissionProtectedCompartments.updatedAt,
    })
    .from(submissionProtectedCompartments)
    .where(
      and(
        eq(
          submissionProtectedCompartments.organizationId,
          scope.organizationId,
        ),
        eq(submissionProtectedCompartments.submissionId, submissionId),
      ),
    )
    .orderBy(submissionProtectedCompartments.compartmentKey);
}

export async function findProtectedCompartment(
  db: DbExecutor,
  scope: TenantScope,
  compartmentId: string,
) {
  const [record] = await db
    .select()
    .from(submissionProtectedCompartments)
    .where(
      and(
        eq(submissionProtectedCompartments.id, compartmentId),
        eq(
          submissionProtectedCompartments.organizationId,
          scope.organizationId,
        ),
      ),
    )
    .limit(1);
  return record ?? null;
}

export async function synchronizeProtectedCompartments(
  db: DbExecutor,
  input: {
    organizationId: string;
    submissionId: string;
    compartments: ReadonlyMap<string, Record<string, unknown>>;
    encrypt: (
      payload: Record<string, unknown>,
      context: {
        organizationId: string;
        submissionId: string;
        compartmentKey: string;
      },
    ) => string;
  },
) {
  const keys = [...input.compartments.keys()];

  if (keys.length === 0) {
    await db
      .delete(submissionProtectedCompartments)
      .where(
        and(
          eq(
            submissionProtectedCompartments.organizationId,
            input.organizationId,
          ),
          eq(
            submissionProtectedCompartments.submissionId,
            input.submissionId,
          ),
        ),
      );
    return;
  }

  await db
    .delete(submissionProtectedCompartments)
    .where(
      and(
        eq(
          submissionProtectedCompartments.organizationId,
          input.organizationId,
        ),
        eq(
          submissionProtectedCompartments.submissionId,
          input.submissionId,
        ),
        // Delete first, then replace the complete protected snapshot below.
        inArray(submissionProtectedCompartments.compartmentKey, keys),
      ),
    );

  // A draft update is a complete validated snapshot. Remove any compartments
  // that disappeared because their fields became hidden or were cleared.
  const existing = await db
    .select({
      id: submissionProtectedCompartments.id,
      compartmentKey: submissionProtectedCompartments.compartmentKey,
    })
    .from(submissionProtectedCompartments)
    .where(
      and(
        eq(
          submissionProtectedCompartments.organizationId,
          input.organizationId,
        ),
        eq(
          submissionProtectedCompartments.submissionId,
          input.submissionId,
        ),
      ),
    );
  if (existing.length > 0) {
    await db
      .delete(submissionProtectedCompartments)
      .where(
        inArray(
          submissionProtectedCompartments.id,
          existing.map((entry) => entry.id),
        ),
      );
  }

  await db.insert(submissionProtectedCompartments).values(
    [...input.compartments.entries()].map(([compartmentKey, payload]) => ({
      organizationId: input.organizationId,
      submissionId: input.submissionId,
      compartmentKey,
      ciphertext: input.encrypt(payload, {
        organizationId: input.organizationId,
        submissionId: input.submissionId,
        compartmentKey,
      }),
      fieldIds: Object.keys(payload).sort(),
    })),
  );
}

export async function listRevealRequestsForCompartments(
  db: DbExecutor,
  scope: TenantScope,
  compartmentIds: readonly string[],
) {
  if (compartmentIds.length === 0) return [];
  return db
    .select()
    .from(protectedRevealRequests)
    .where(
      and(
        eq(protectedRevealRequests.organizationId, scope.organizationId),
        inArray(protectedRevealRequests.compartmentId, [...compartmentIds]),
      ),
    )
    .orderBy(desc(protectedRevealRequests.createdAt));
}
