import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNull,
} from "drizzle-orm";
import type {
  Database,
  DatabaseTransaction,
} from "@/db/client";
import {
  caseCommunicationThreads,
  caseCorrespondenceMessages,
  cases,
  externalParticipantCredentials,
  externalParticipantSessions,
  intakeFormVersions,
  intakeSubmissions,
  organizations,
} from "@/db/schema";
import type { TenantScope } from "@/lib/tenancy";

type DbExecutor = Database | DatabaseTransaction;

export async function insertExternalParticipantCredential(
  db: DbExecutor,
  input: {
    organizationId: string;
    submissionId: string;
    secretHash: string;
  },
) {
  const [credential] = await db
    .insert(externalParticipantCredentials)
    .values({
      organizationId: input.organizationId,
      submissionId: input.submissionId,
      secretHash: input.secretHash,
    })
    .returning();
  return credential;
}

export async function findExternalParticipantCredentialForLogin(
  db: Database,
  input: {
    organizationSlug: string;
    confirmationCode: string;
  },
) {
  const [row] = await db
    .select({
      credential: externalParticipantCredentials,
      submission: intakeSubmissions,
      organization: {
        id: organizations.id,
        slug: organizations.slug,
        name: organizations.name,
      },
    })
    .from(externalParticipantCredentials)
    .innerJoin(
      intakeSubmissions,
      and(
        eq(
          intakeSubmissions.id,
          externalParticipantCredentials.submissionId,
        ),
        eq(
          intakeSubmissions.organizationId,
          externalParticipantCredentials.organizationId,
        ),
      ),
    )
    .innerJoin(
      organizations,
      eq(
        organizations.id,
        externalParticipantCredentials.organizationId,
      ),
    )
    .where(
      and(
        eq(organizations.slug, input.organizationSlug),
        eq(organizations.status, "active"),
        eq(
          intakeSubmissions.confirmationCode,
          input.confirmationCode,
        ),
        eq(intakeSubmissions.status, "submitted"),
        eq(externalParticipantCredentials.status, "active"),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function createExternalParticipantSession(
  db: DbExecutor,
  input: {
    organizationId: string;
    credentialId: string;
    tokenHash: string;
    expiresAt: Date;
  },
) {
  const [session] = await db
    .insert(externalParticipantSessions)
    .values({
      organizationId: input.organizationId,
      credentialId: input.credentialId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
    })
    .returning();
  return session;
}

export async function findExternalParticipantSessionContext(
  db: Database,
  input: {
    organizationSlug: string;
    tokenHash: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const [row] = await db
    .select({
      session: externalParticipantSessions,
      credential: externalParticipantCredentials,
      submission: intakeSubmissions,
      formVersion: {
        id: intakeFormVersions.id,
        definition: intakeFormVersions.definition,
      },
      organization: {
        id: organizations.id,
        slug: organizations.slug,
        name: organizations.name,
      },
      case: cases,
    })
    .from(externalParticipantSessions)
    .innerJoin(
      externalParticipantCredentials,
      and(
        eq(
          externalParticipantCredentials.id,
          externalParticipantSessions.credentialId,
        ),
        eq(
          externalParticipantCredentials.organizationId,
          externalParticipantSessions.organizationId,
        ),
      ),
    )
    .innerJoin(
      intakeSubmissions,
      and(
        eq(
          intakeSubmissions.id,
          externalParticipantCredentials.submissionId,
        ),
        eq(
          intakeSubmissions.organizationId,
          externalParticipantCredentials.organizationId,
        ),
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
          intakeSubmissions.organizationId,
        ),
      ),
    )
    .innerJoin(
      organizations,
      eq(
        organizations.id,
        externalParticipantSessions.organizationId,
      ),
    )
    .leftJoin(
      cases,
      and(
        eq(cases.sourceSubmissionId, intakeSubmissions.id),
        eq(cases.organizationId, intakeSubmissions.organizationId),
      ),
    )
    .where(
      and(
        eq(
          externalParticipantSessions.tokenHash,
          input.tokenHash,
        ),
        eq(organizations.slug, input.organizationSlug),
        eq(organizations.status, "active"),
        isNull(externalParticipantSessions.revokedAt),
        gt(externalParticipantSessions.expiresAt, now),
        eq(externalParticipantCredentials.status, "active"),
        eq(intakeSubmissions.status, "submitted"),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function touchExternalParticipantSession(
  db: Database,
  sessionId: string,
  when = new Date(),
) {
  await db
    .update(externalParticipantSessions)
    .set({ lastSeenAt: when })
    .where(eq(externalParticipantSessions.id, sessionId));
}

export async function revokeExternalParticipantSessionByTokenHash(
  db: Database,
  tokenHash: string,
  when = new Date(),
) {
  await db
    .update(externalParticipantSessions)
    .set({ revokedAt: when })
    .where(
      and(
        eq(externalParticipantSessions.tokenHash, tokenHash),
        isNull(externalParticipantSessions.revokedAt),
      ),
    );
}

export async function markExternalParticipantAuthenticated(
  db: DbExecutor,
  credentialId: string,
  when = new Date(),
) {
  await db
    .update(externalParticipantCredentials)
    .set({
      lastAuthenticatedAt: when,
      updatedAt: when,
    })
    .where(eq(externalParticipantCredentials.id, credentialId));
}

export async function listExternalParticipantPortalMessages(
  db: Database,
  scope: TenantScope,
  caseId: string,
) {
  return db
    .select({
      message: caseCorrespondenceMessages,
      thread: caseCommunicationThreads,
    })
    .from(caseCorrespondenceMessages)
    .innerJoin(
      caseCommunicationThreads,
      and(
        eq(
          caseCommunicationThreads.id,
          caseCorrespondenceMessages.threadId,
        ),
        eq(
          caseCommunicationThreads.organizationId,
          caseCorrespondenceMessages.organizationId,
        ),
      ),
    )
    .where(
      and(
        eq(
          caseCorrespondenceMessages.organizationId,
          scope.organizationId,
        ),
        eq(caseCorrespondenceMessages.caseId, caseId),
        eq(caseCorrespondenceMessages.channel, "portal"),
        inArray(caseCorrespondenceMessages.visibility, [
          "participant",
          "public",
        ]),
        inArray(caseCorrespondenceMessages.status, [
          "sent",
          "received",
        ]),
      ),
    )
    .orderBy(
      asc(caseCorrespondenceMessages.createdAt),
      asc(caseCorrespondenceMessages.id),
    );
}

export async function externalParticipantCanReplyToThread(
  db: Database,
  scope: TenantScope,
  caseId: string,
  threadId: string,
) {
  const [row] = await db
    .select({ id: caseCommunicationThreads.id })
    .from(caseCommunicationThreads)
    .innerJoin(
      caseCorrespondenceMessages,
      and(
        eq(
          caseCorrespondenceMessages.threadId,
          caseCommunicationThreads.id,
        ),
        eq(
          caseCorrespondenceMessages.organizationId,
          caseCommunicationThreads.organizationId,
        ),
      ),
    )
    .where(
      and(
        eq(caseCommunicationThreads.id, threadId),
        eq(caseCommunicationThreads.caseId, caseId),
        eq(
          caseCommunicationThreads.organizationId,
          scope.organizationId,
        ),
        eq(caseCorrespondenceMessages.channel, "portal"),
        inArray(caseCorrespondenceMessages.visibility, [
          "participant",
          "public",
        ]),
        inArray(caseCorrespondenceMessages.status, [
          "sent",
          "received",
        ]),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function listExternalParticipantCredentialForSubmission(
  db: Database,
  scope: TenantScope,
  submissionId: string,
) {
  const [credential] = await db
    .select({
      id: externalParticipantCredentials.id,
      submissionId: externalParticipantCredentials.submissionId,
      status: externalParticipantCredentials.status,
      credentialVersion:
        externalParticipantCredentials.credentialVersion,
      lastAuthenticatedAt:
        externalParticipantCredentials.lastAuthenticatedAt,
      revokedAt: externalParticipantCredentials.revokedAt,
      createdAt: externalParticipantCredentials.createdAt,
      updatedAt: externalParticipantCredentials.updatedAt,
    })
    .from(externalParticipantCredentials)
    .where(
      and(
        eq(
          externalParticipantCredentials.organizationId,
          scope.organizationId,
        ),
        eq(
          externalParticipantCredentials.submissionId,
          submissionId,
        ),
      ),
    )
    .limit(1);
  return credential ?? null;
}


export async function findCaseParticipantMessagingPolicyContext(
  db: Database,
  scope: TenantScope,
  caseId: string,
) {
  const [row] = await db
    .select({
      caseId: cases.id,
      submission: {
        id: intakeSubmissions.id,
        answers: intakeSubmissions.answers,
      },
      formVersion: {
        id: intakeFormVersions.id,
        definition: intakeFormVersions.definition,
      },
      credential: {
        id: externalParticipantCredentials.id,
        status: externalParticipantCredentials.status,
        revokedAt: externalParticipantCredentials.revokedAt,
      },
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
    .leftJoin(
      externalParticipantCredentials,
      and(
        eq(
          externalParticipantCredentials.submissionId,
          intakeSubmissions.id,
        ),
        eq(
          externalParticipantCredentials.organizationId,
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
