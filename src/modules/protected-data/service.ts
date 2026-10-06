import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  auditEvents,
  protectedRevealRequests,
  submissionProtectedCompartments,
} from "@/db/schema";
import type { TenantScope } from "@/lib/tenancy";
import { auditEventValues } from "@/modules/audit/event";
import { decryptProtectedPayload } from "./crypto";
import { findProtectedCompartment } from "./repository";

const REVEAL_TTL_MS = 15 * 60 * 1000;

export class ProtectedCompartmentNotFoundError extends Error {
  constructor() {
    super("Protected compartment was not found.");
    this.name = "ProtectedCompartmentNotFoundError";
  }
}

export class ProtectedRevealConflictError extends Error {
  constructor(message = "Protected reveal request is not available.") {
    super(message);
    this.name = "ProtectedRevealConflictError";
  }
}

export async function requestProtectedReveal(
  db: Database,
  scope: TenantScope,
  input: {
    compartmentId: string;
    actorUserId: string;
    reason: string;
  },
) {
  const reason = input.reason.trim();
  if (!reason || reason.length > 5000) {
    throw new Error("A reveal reason between 1 and 5000 characters is required.");
  }

  return db.transaction(async (tx) => {
    const compartment = await findProtectedCompartment(
      tx,
      scope,
      input.compartmentId,
    );
    if (!compartment) {
      throw new ProtectedCompartmentNotFoundError();
    }

    const [request] = await tx
      .insert(protectedRevealRequests)
      .values({
        organizationId: scope.organizationId,
        compartmentId: compartment.id,
        requestedByUserId: input.actorUserId,
        reason,
        status: "pending",
      })
      .returning();

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId: input.actorUserId,
        action: "protected_data.reveal_requested",
        resourceType: "protected_compartment",
        resourceId: compartment.id,
        parentResourceType: "submission",
        parentResourceId: compartment.submissionId,
        metadata: {
          revealRequestId: request.id,
          compartmentKey: compartment.compartmentKey,
        },
      }),
    );

    return request;
  });
}

export async function decideProtectedReveal(
  db: Database,
  scope: TenantScope,
  input: {
    requestId: string;
    actorUserId: string;
    decision: "approved" | "rejected";
    decisionReason?: string | null;
  },
) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        request: protectedRevealRequests,
        compartment: submissionProtectedCompartments,
      })
      .from(protectedRevealRequests)
      .innerJoin(
        submissionProtectedCompartments,
        and(
          eq(
            submissionProtectedCompartments.id,
            protectedRevealRequests.compartmentId,
          ),
          eq(
            submissionProtectedCompartments.organizationId,
            protectedRevealRequests.organizationId,
          ),
        ),
      )
      .where(
        and(
          eq(protectedRevealRequests.id, input.requestId),
          eq(
            protectedRevealRequests.organizationId,
            scope.organizationId,
          ),
        ),
      )
      .limit(1);

    if (!current || current.request.status !== "pending") {
      throw new ProtectedRevealConflictError();
    }
    if (current.request.requestedByUserId === input.actorUserId) {
      throw new ProtectedRevealConflictError(
        "The requester cannot approve or reject their own reveal request.",
      );
    }

    const now = new Date();
    const [updated] = await tx
      .update(protectedRevealRequests)
      .set({
        status: input.decision,
        decidedByUserId: input.actorUserId,
        decisionReason: input.decisionReason?.trim().slice(0, 5000) || null,
        decidedAt: now,
        expiresAt:
          input.decision === "approved"
            ? new Date(now.getTime() + REVEAL_TTL_MS)
            : null,
        updatedAt: now,
      })
      .where(
        and(
          eq(protectedRevealRequests.id, current.request.id),
          eq(protectedRevealRequests.status, "pending"),
        ),
      )
      .returning();

    if (!updated) {
      throw new ProtectedRevealConflictError(
        "Protected reveal request changed concurrently.",
      );
    }

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId: input.actorUserId,
        action:
          input.decision === "approved"
            ? "protected_data.reveal_approved"
            : "protected_data.reveal_rejected",
        resourceType: "protected_compartment",
        resourceId: current.compartment.id,
        parentResourceType: "submission",
        parentResourceId: current.compartment.submissionId,
        metadata: {
          revealRequestId: updated.id,
          compartmentKey: current.compartment.compartmentKey,
          requesterUserId: current.request.requestedByUserId,
          decisionReasonProvided: Boolean(input.decisionReason?.trim()),
          expiresAt: updated.expiresAt?.toISOString() ?? null,
        },
      }),
    );

    return updated;
  });
}

export async function consumeProtectedReveal(
  db: Database,
  scope: TenantScope,
  input: {
    requestId: string;
    actorUserId: string;
  },
) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        request: protectedRevealRequests,
        compartment: submissionProtectedCompartments,
      })
      .from(protectedRevealRequests)
      .innerJoin(
        submissionProtectedCompartments,
        and(
          eq(
            submissionProtectedCompartments.id,
            protectedRevealRequests.compartmentId,
          ),
          eq(
            submissionProtectedCompartments.organizationId,
            protectedRevealRequests.organizationId,
          ),
        ),
      )
      .where(
        and(
          eq(protectedRevealRequests.id, input.requestId),
          eq(
            protectedRevealRequests.organizationId,
            scope.organizationId,
          ),
        ),
      )
      .limit(1);

    const now = new Date();
    if (
      !current ||
      current.request.status !== "approved" ||
      current.request.requestedByUserId !== input.actorUserId ||
      !current.request.expiresAt ||
      current.request.expiresAt <= now ||
      current.request.consumedAt
    ) {
      throw new ProtectedRevealConflictError();
    }

    const [consumed] = await tx
      .update(protectedRevealRequests)
      .set({
        status: "consumed",
        consumedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(protectedRevealRequests.id, current.request.id),
          eq(protectedRevealRequests.status, "approved"),
          eq(
            protectedRevealRequests.requestedByUserId,
            input.actorUserId,
          ),
        ),
      )
      .returning();

    if (!consumed) {
      throw new ProtectedRevealConflictError(
        "Protected reveal request changed concurrently.",
      );
    }

    const payload = decryptProtectedPayload(
      current.compartment.ciphertext,
      {
        organizationId: scope.organizationId,
        submissionId: current.compartment.submissionId,
        compartmentKey: current.compartment.compartmentKey,
      },
    );

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId: input.actorUserId,
        action: "protected_data.revealed",
        resourceType: "protected_compartment",
        resourceId: current.compartment.id,
        parentResourceType: "submission",
        parentResourceId: current.compartment.submissionId,
        metadata: {
          revealRequestId: current.request.id,
          compartmentKey: current.compartment.compartmentKey,
          fieldCount: current.compartment.fieldIds.length,
          approvedByUserId: current.request.decidedByUserId,
        },
      }),
    );

    return {
      request: consumed,
      compartment: {
        id: current.compartment.id,
        submissionId: current.compartment.submissionId,
        compartmentKey: current.compartment.compartmentKey,
        fieldIds: current.compartment.fieldIds,
      },
      payload,
    };
  });
}
