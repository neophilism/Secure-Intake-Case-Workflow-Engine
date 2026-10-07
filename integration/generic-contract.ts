import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import {
  applicationProfiles,
  auditEvents,
  caseQueues,
  caseTeams,
  caseWorkflowVersions,
  caseWorkflows,
  cases,
  externalParticipantCredentials,
  externalParticipantSessions,
  documentCaseLinks,
  documentSubmissionLinks,
  documentVersions,
  intakeForms,
  intakeFormVersions,
  intakeSubmissions,
  reviewPolicies,
} from "../src/db/schema";
import { createTrustedTenantScope } from "../src/lib/tenancy";
import {
  parseApplicationManifest,
  type ApplicationManifest,
} from "../src/modules/application/manifest";
import { applyApplicationManifest } from "../src/modules/application/service";
import { bootstrapOrganizationAdministrator } from "../src/modules/auth/bootstrap";
import { listMembershipAuthorization } from "../src/modules/auth/repository";
import {
  createCaseFromSubmission,
  transitionCase,
} from "../src/modules/cases/service";
import {
  createOutboundCorrespondenceDraft,
  queueOutboundCorrespondence,
} from "../src/modules/communications/service";
import {
  listCaseDeadlines,
  listDeadlineHistory,
} from "../src/modules/deadlines/repository";
import { extendDeadline } from "../src/modules/deadlines/service";
import {
  recordMalwareScanResult,
} from "../src/modules/documents/service";
import {
  stagePublicSubmissionUploads,
} from "../src/modules/documents/public-upload";
import type { DocumentStorageAdapter } from "../src/modules/documents/storage";
import { answersFromFormData } from "../src/modules/forms/form-data";
import {
  createPublicDraftSubmission,
  submitDraftSubmissionByToken,
  submitPublicForm,
} from "../src/modules/forms/service";
import {
  listProtectedCompartmentsForSubmission,
} from "../src/modules/protected-data/repository";
import {
  consumeProtectedReveal,
  decideProtectedReveal,
  requestProtectedReveal,
} from "../src/modules/protected-data/service";
import {
  authenticateExternalParticipant,
  listExternalParticipantMessages,
  logoutExternalParticipant,
  resolveExternalParticipantContext,
  sendExternalParticipantMessage,
} from "../src/modules/participant-portal/service";
import {
  addTeamMember,
  applyRoutingRules,
} from "../src/modules/routing/service";
import {
  listReferralDeadlines,
} from "../src/modules/referrals/repository";
import {
  acknowledgeCaseReferral,
  createCaseReferral,
  recordCaseReferralResponse,
  sendCaseReferral,
} from "../src/modules/referrals/service";
import {
  applyReviewDecisionToCase,
  assignReview,
  beginReview,
  decideReview,
  fileCaseReview,
} from "../src/modules/reviews/service";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for generic integration tests.");
}

const manifestUrl = new URL(
  "../examples/application-manifest.example.json",
  import.meta.url,
);

async function main() {
  const manifest = parseApplicationManifest(
    JSON.parse(await readFile(manifestUrl, "utf8")),
  );
  assert.equal(manifest.application.key, "example_application");

  const suffix = randomUUID().slice(0, 8);
  const organizationSlug = `contract-${suffix}`;
  const organizationName = `Contract ${suffix}`;
  const password = "NeutralContractPassword!123";
  const { client, db } = createDatabase(databaseUrl);

  try {
    const actor = await bootstrapOrganizationAdministrator(db, {
      email: `actor-${suffix}@example.invalid`,
      password,
      displayName: "Example Actor",
      organizationName,
      organizationSlug,
    });
    const reviewer = await bootstrapOrganizationAdministrator(db, {
      email: `reviewer-${suffix}@example.invalid`,
      password,
      displayName: "Example Reviewer",
      organizationName,
      organizationSlug,
    });
    const scope = createTrustedTenantScope(actor.organizationId);

    // First apply creates the portable resources.
    const firstApply = await applyApplicationManifest(
      db,
      scope,
      manifest,
      actor.userId,
    );
    assert.equal(firstApply.noChange, false);

    // Identical reapplication is a true idempotent no-op.
    const identicalApply = await applyApplicationManifest(
      db,
      scope,
      manifest,
      actor.userId,
    );
    assert.equal(identicalApply.noChange, true);
    assert.equal(identicalApply.revisionId, firstApply.revisionId);

    const [applicationProfile] = await db
      .select()
      .from(applicationProfiles)
      .where(
        eq(
          applicationProfiles.organizationId,
          scope.organizationId,
        ),
      )
      .limit(1);
    assert.ok(applicationProfile);
    assert.equal(applicationProfile.operationalViews.length, 1);
    assert.equal(applicationProfile.operationalMetrics.length, 3);

    const [team] = await db
      .select()
      .from(caseTeams)
      .where(
        and(
          eq(caseTeams.organizationId, scope.organizationId),
          eq(caseTeams.slug, "example_team"),
        ),
      )
      .limit(1);
    assert.ok(team);

    await addTeamMember(db, scope, {
      teamId: team.id,
      membershipId: actor.membershipId,
      actorUserId: actor.userId,
    });

    const [form] = await db
      .select()
      .from(intakeForms)
      .where(
        and(
          eq(intakeForms.organizationId, scope.organizationId),
          eq(intakeForms.slug, "example_form"),
        ),
      )
      .limit(1);
    assert.ok(form);

    const [formVersionV1] = await db
      .select()
      .from(intakeFormVersions)
      .where(
        and(
          eq(intakeFormVersions.organizationId, scope.organizationId),
          eq(intakeFormVersions.formId, form.id),
          eq(intakeFormVersions.status, "published"),
        ),
      )
      .limit(1);
    assert.ok(formVersionV1);
    assert.equal(formVersionV1.versionNumber, 1);

    const uploadForm = manifest.forms.find(
      (item) => item.slug === "example_form",
    );
    assert.ok(uploadForm);

    const memoryObjects = new Map<string, Uint8Array>();
    const memoryStorage: DocumentStorageAdapter = {
      driver: "integration-memory",
      async put(key, data) {
        if (memoryObjects.has(key)) {
          throw new Error("Duplicate integration storage key.");
        }
        memoryObjects.set(key, new Uint8Array(data));
      },
      async get(key) {
        const value = memoryObjects.get(key);
        if (!value) throw new Error("Integration object missing.");
        return new Uint8Array(value);
      },
      async remove(key) {
        memoryObjects.delete(key);
      },
    };

    const uploadFormData = new FormData();
    uploadFormData.set("example_contact_mode", "status_only");
    uploadFormData.set("example_value", "example attachment submission");
    uploadFormData.set("example_secret", "protected upload value");
    uploadFormData.append(
      "example_attachment",
      new Blob(["%PDF-1.7\nneutral fixture\n"], {
        type: "application/pdf",
      }),
      "example.pdf",
    );

    const uploadAnswers = answersFromFormData(
      uploadForm.definition,
      uploadFormData,
    );
    const stagedUpload = await stagePublicSubmissionUploads(
      db,
      scope,
      uploadForm.definition,
      uploadAnswers,
      uploadFormData,
      memoryStorage,
    );
    assert.equal(stagedUpload.uploads.length, 1);
    assert.equal(
      stagedUpload.answerReferences.example_attachment?.length,
      1,
    );

    const uploadSubmission = await submitPublicForm(
      db,
      organizationSlug,
      "example_form",
      {
        ...uploadAnswers,
        ...stagedUpload.answerReferences,
      },
      null,
      stagedUpload.uploads,
    );

    const [submissionDocument] = await db
      .select({
        versionId: documentVersions.id,
        contentStatus: documentVersions.contentStatus,
        malwareScanStatus: documentVersions.malwareScanStatus,
        sha256: documentVersions.sha256,
      })
      .from(documentSubmissionLinks)
      .innerJoin(
        documentVersions,
        eq(
          documentVersions.id,
          documentSubmissionLinks.documentVersionId,
        ),
      )
      .where(
        eq(
          documentSubmissionLinks.submissionId,
          uploadSubmission.id,
        ),
      )
      .limit(1);
    assert.ok(submissionDocument);
    assert.equal(submissionDocument.contentStatus, "quarantined");
    assert.equal(submissionDocument.malwareScanStatus, "pending");
    assert.match(submissionDocument.sha256, /^[a-f0-9]{64}$/);

    const uploadCase = await createCaseFromSubmission(db, scope, {
      submissionId: uploadSubmission.id,
      actorUserId: actor.userId,
      title: "Example attachment record",
    });

    let [promotedLink] = await db
      .select({ id: documentCaseLinks.id })
      .from(documentCaseLinks)
      .where(
        and(
          eq(documentCaseLinks.caseId, uploadCase.id),
          eq(
            documentCaseLinks.documentVersionId,
            submissionDocument.versionId,
          ),
        ),
      )
      .limit(1);
    assert.equal(promotedLink, undefined);

    await recordMalwareScanResult(db, scope, {
      versionId: submissionDocument.versionId,
      status: "clean",
      provider: "integration-test-scanner",
      actorUserId: actor.userId,
    });

    [promotedLink] = await db
      .select({ id: documentCaseLinks.id })
      .from(documentCaseLinks)
      .where(
        and(
          eq(documentCaseLinks.caseId, uploadCase.id),
          eq(
            documentCaseLinks.documentVersionId,
            submissionDocument.versionId,
          ),
        ),
      )
      .limit(1);
    assert.ok(promotedLink);

    const referralA = await createCaseReferral(db, scope, {
      caseId: uploadCase.id,
      policyKey: "example_external_referral",
      recipientKey: "recipient_a",
      recipientName: "Example Recipient A",
      subject: "Parallel referral A",
      actorUserId: actor.userId,
    });
    const referralB = await createCaseReferral(db, scope, {
      caseId: uploadCase.id,
      policyKey: "example_external_referral",
      recipientKey: "recipient_b",
      recipientName: "Example Recipient B",
      subject: "Parallel referral B",
      actorUserId: actor.userId,
    });

    const referralStartedAt = new Date("2026-10-07T12:00:00.000Z");
    await sendCaseReferral(db, scope, {
      referralId: referralA.id,
      actorUserId: actor.userId,
      sentAt: referralStartedAt,
    });
    await sendCaseReferral(db, scope, {
      referralId: referralB.id,
      actorUserId: actor.userId,
      sentAt: referralStartedAt,
    });

    let referralADeadlines = await listReferralDeadlines(
      db,
      scope,
      referralA.id,
    );
    let referralBDeadlines = await listReferralDeadlines(
      db,
      scope,
      referralB.id,
    );
    assert.equal(referralADeadlines.length, 2);
    assert.equal(referralBDeadlines.length, 2);
    assert.deepEqual(
      new Set(referralADeadlines.map((item) => item.policyKey)),
      new Set(["example_acknowledgment", "example_final_response"]),
    );
    assert.deepEqual(
      new Set(referralBDeadlines.map((item) => item.policyKey)),
      new Set(["example_acknowledgment", "example_final_response"]),
    );
    assert.equal(
      referralADeadlines.some((item) =>
        referralBDeadlines.some((other) => other.id === item.id),
      ),
      false,
    );

    await acknowledgeCaseReferral(db, scope, {
      referralId: referralA.id,
      actorUserId: actor.userId,
      summary: "Recipient A acknowledged.",
      occurredAt: new Date("2026-10-08T12:00:00.000Z"),
    });

    referralADeadlines = await listReferralDeadlines(
      db,
      scope,
      referralA.id,
    );
    referralBDeadlines = await listReferralDeadlines(
      db,
      scope,
      referralB.id,
    );
    assert.equal(
      referralADeadlines.find(
        (item) => item.policyKey === "example_acknowledgment",
      )?.status,
      "completed",
    );
    assert.equal(
      referralBDeadlines.find(
        (item) => item.policyKey === "example_acknowledgment",
      )?.status,
      "active",
    );

    const referralBFinal = referralBDeadlines.find(
      (item) => item.policyKey === "example_final_response",
    );
    assert.ok(referralBFinal);
    const originalReferralBDueAt = referralBFinal.dueAt;
    const extendedReferralBDeadline = await extendDeadline(db, scope, {
      deadlineId: referralBFinal.id,
      actorUserId: actor.userId,
      reason: "Neutral agreed extension",
      extension: { value: 5, unit: "calendar_days" },
      now: new Date("2026-10-09T12:00:00.000Z"),
    });
    assert.ok(
      extendedReferralBDeadline.dueAt.getTime() >
        originalReferralBDueAt.getTime(),
    );
    const referralBDeadlineHistory = await listDeadlineHistory(
      db,
      scope,
      referralBFinal.id,
    );
    assert.equal(
      referralBDeadlineHistory.some(
        (event) => event.eventType === "extended",
      ),
      true,
    );

    await recordCaseReferralResponse(db, scope, {
      referralId: referralA.id,
      responseType: "final_response",
      summary: "Recipient A supplied a final response.",
      actorUserId: actor.userId,
      occurredAt: new Date("2026-10-10T12:00:00.000Z"),
    });
    referralADeadlines = await listReferralDeadlines(
      db,
      scope,
      referralA.id,
    );
    referralBDeadlines = await listReferralDeadlines(
      db,
      scope,
      referralB.id,
    );
    assert.equal(
      referralADeadlines.find(
        (item) => item.policyKey === "example_final_response",
      )?.status,
      "completed",
    );
    assert.equal(
      referralBDeadlines.find(
        (item) => item.policyKey === "example_final_response",
      )?.status,
      "active",
    );

    const [workflow] = await db
      .select()
      .from(caseWorkflows)
      .where(
        and(
          eq(caseWorkflows.organizationId, scope.organizationId),
          eq(caseWorkflows.slug, "example_workflow"),
        ),
      )
      .limit(1);
    assert.ok(workflow);

    const [workflowVersionV1] = await db
      .select()
      .from(caseWorkflowVersions)
      .where(
        and(
          eq(caseWorkflowVersions.organizationId, scope.organizationId),
          eq(caseWorkflowVersions.workflowId, workflow.id),
          eq(caseWorkflowVersions.status, "published"),
        ),
      )
      .limit(1);
    assert.ok(workflowVersionV1);
    assert.equal(workflowVersionV1.versionNumber, 1);

    const draft = await createPublicDraftSubmission(
      db,
      organizationSlug,
      "example_form",
      {
        example_contact_mode: "messaging",
        example_value: "example value",
        example_secret: "protected draft value",
      },
    );

    const [persistedDraft] = await db
      .select()
      .from(intakeSubmissions)
      .where(eq(intakeSubmissions.id, draft.submissionId))
      .limit(1);
    assert.ok(persistedDraft);
    assert.deepEqual(persistedDraft.answers, {
      example_contact_mode: "messaging",
      example_value: "example value",
    });
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        persistedDraft.answers,
        "example_secret",
      ),
      false,
    );

    let protectedCompartments =
      await listProtectedCompartmentsForSubmission(
        db,
        scope,
        draft.submissionId,
      );
    assert.equal(protectedCompartments.length, 1);
    assert.equal(
      protectedCompartments[0].compartmentKey,
      "example_secret",
    );
    assert.deepEqual(protectedCompartments[0].fieldIds, [
      "example_secret",
    ]);

    const submission = await submitDraftSubmissionByToken(
      db,
      draft.resumeToken,
      {
        example_contact_mode: "messaging",
        example_value: "example value",
        example_secret: "protected submitted value",
      },
    );
    assert.equal(submission.formVersionId, formVersionV1.id);
    assert.deepEqual(submission.answers, {
      example_contact_mode: "messaging",
      example_value: "example value",
    });
    assert.ok(submission.participantPortalSecret);

    const [participantCredential] = await db
      .select()
      .from(externalParticipantCredentials)
      .where(
        eq(
          externalParticipantCredentials.submissionId,
          submission.id,
        ),
      )
      .limit(1);
    assert.ok(participantCredential);
    assert.notEqual(
      participantCredential.secretHash,
      submission.participantPortalSecret,
    );
    assert.equal(participantCredential.secretHash.length, 64);

    await assert.rejects(
      () =>
        authenticateExternalParticipant(db, {
          organizationSlug,
          confirmationCode: submission.confirmationCode ?? "",
          secret: "x".repeat(43),
        }),
      /Invalid tracking code or access secret/i,
    );

    const participantLogin =
      await authenticateExternalParticipant(db, {
        organizationSlug,
        confirmationCode: submission.confirmationCode ?? "",
        secret: submission.participantPortalSecret,
      });
    assert.ok(participantLogin.token);
    assert.notEqual(
      participantLogin.token,
      submission.participantPortalSecret,
    );

    const [participantSession] = await db
      .select()
      .from(externalParticipantSessions)
      .where(
        eq(
          externalParticipantSessions.credentialId,
          participantCredential.id,
        ),
      )
      .limit(1);
    assert.ok(participantSession);
    assert.notEqual(
      participantSession.tokenHash,
      participantLogin.token,
    );
    assert.equal(participantSession.tokenHash.length, 64);

    let participantContext =
      await resolveExternalParticipantContext(db, {
        organizationSlug,
        sessionToken: participantLogin.token,
      });
    assert.ok(participantContext);
    assert.equal(participantContext.case, null);
    assert.equal(participantContext.allowMessaging, true);


    const statusOnlyDraft = await createPublicDraftSubmission(
      db,
      organizationSlug,
      "example_form",
      {
        example_contact_mode: "status_only",
        example_value: "status-only example",
        example_secret: "status-only protected value",
      },
    );
    const statusOnlySubmission =
      await submitDraftSubmissionByToken(
        db,
        statusOnlyDraft.resumeToken,
        {
          example_contact_mode: "status_only",
          example_value: "status-only example",
          example_secret: "status-only protected value",
        },
      );
    assert.ok(statusOnlySubmission.participantPortalSecret);

    const statusOnlyLogin =
      await authenticateExternalParticipant(db, {
        organizationSlug,
        confirmationCode:
          statusOnlySubmission.confirmationCode ?? "",
        secret: statusOnlySubmission.participantPortalSecret,
      });
    const statusOnlyContext =
      await resolveExternalParticipantContext(db, {
        organizationSlug,
        sessionToken: statusOnlyLogin.token,
      });
    assert.ok(statusOnlyContext);
    assert.equal(statusOnlyContext.allowMessaging, false);
    assert.deepEqual(
      await listExternalParticipantMessages(
        db,
        statusOnlyContext,
      ),
      [],
    );
    await assert.rejects(
      () =>
        sendExternalParticipantMessage(
          db,
          statusOnlyContext,
          { body: "must not be accepted" },
        ),
      /Messaging is not enabled/i,
    );
    await logoutExternalParticipant(db, {
      sessionToken: statusOnlyLogin.token,
    });

    protectedCompartments =
      await listProtectedCompartmentsForSubmission(
        db,
        scope,
        submission.id,
      );
    assert.equal(protectedCompartments.length, 1);

    const revealRequest = await requestProtectedReveal(
      db,
      scope,
      {
        compartmentId: protectedCompartments[0].id,
        actorUserId: actor.userId,
        reason: "neutral protected-data integration test",
      },
    );

    await assert.rejects(
      () =>
        decideProtectedReveal(db, scope, {
          requestId: revealRequest.id,
          actorUserId: actor.userId,
          decision: "approved",
          decisionReason: "self approval must fail",
        }),
      /requester cannot approve or reject their own/i,
    );

    const approvedReveal = await decideProtectedReveal(
      db,
      scope,
      {
        requestId: revealRequest.id,
        actorUserId: reviewer.userId,
        decision: "approved",
        decisionReason: "neutral second-person approval",
      },
    );
    assert.equal(approvedReveal.status, "approved");

    const revealed = await consumeProtectedReveal(
      db,
      scope,
      {
        requestId: revealRequest.id,
        actorUserId: actor.userId,
      },
    );
    assert.deepEqual(revealed.payload, {
      example_secret: "protected submitted value",
    });

    await assert.rejects(
      () =>
        consumeProtectedReveal(db, scope, {
          requestId: revealRequest.id,
          actorUserId: actor.userId,
        }),
      /not available/i,
    );

    const protectedAuditEvents = await db
      .select({
        action: auditEvents.action,
        previousState: auditEvents.previousState,
        newState: auditEvents.newState,
        metadata: auditEvents.metadata,
      })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.organizationId, scope.organizationId),
          eq(auditEvents.resourceType, "protected_compartment"),
        ),
      );
    assert.deepEqual(
      new Set(protectedAuditEvents.map((event) => event.action)),
      new Set([
        "protected_data.reveal_requested",
        "protected_data.reveal_approved",
        "protected_data.revealed",
      ]),
    );
    assert.equal(
      JSON.stringify(protectedAuditEvents).includes(
        "protected submitted value",
      ),
      false,
    );

    let record = await createCaseFromSubmission(db, scope, {
      submissionId: submission.id,
      actorUserId: actor.userId,
      title: "Example Record",
    });
    assert.equal(record.status, "state_a");
    assert.equal(record.workflowVersionId, workflowVersionV1.id);

    participantContext =
      await resolveExternalParticipantContext(db, {
        organizationSlug,
        sessionToken: participantLogin.token,
      });
    assert.ok(participantContext);
    assert.ok(participantContext.case);
    assert.equal(participantContext.case.caseNumber, record.caseNumber);
    assert.equal(participantContext.case.status, "state_a");
    assert.equal(participantContext.case.statusLabel, "State A");

    const portalDraft =
      await createOutboundCorrespondenceDraft(db, scope, {
        caseId: record.id,
        channel: "portal",
        visibility: "participant",
        subject: "Example participant update",
        body: "Participant-visible portal update.",
        recipients: [],
        actorUserId: actor.userId,
      });
    assert.equal(portalDraft.status, "draft");

    const portalPublished =
      await queueOutboundCorrespondence(db, scope, {
        messageId: portalDraft.id,
        actorUserId: actor.userId,
      });
    assert.equal(portalPublished.status, "sent");
    assert.equal(
      portalPublished.deliveryProvider,
      "participant-portal",
    );

    await assert.rejects(
      () =>
        createOutboundCorrespondenceDraft(db, scope, {
          caseId: record.id,
          channel: "portal",
          visibility: "internal",
          subject: "Internal portal message",
          body: "This must never be participant-visible.",
          recipients: [],
          actorUserId: actor.userId,
        }),
      /Portal correspondence must be participant or public visibility/i,
    );

    let participantMessages =
      await listExternalParticipantMessages(
        db,
        participantContext,
      );
    assert.equal(participantMessages.length, 1);
    assert.equal(
      participantMessages[0].body,
      "Participant-visible portal update.",
    );

    const participantReply =
      await sendExternalParticipantMessage(
        db,
        participantContext,
        {
          threadId: participantMessages[0].threadId,
          body: "Participant reply.",
        },
      );
    assert.equal(participantReply.direction, "inbound");
    assert.equal(participantReply.channel, "portal");
    assert.equal(participantReply.visibility, "participant");
    assert.equal(participantReply.status, "received");

    participantMessages =
      await listExternalParticipantMessages(
        db,
        participantContext,
      );
    assert.equal(participantMessages.length, 2);
    assert.equal(
      participantMessages[1].body,
      "Participant reply.",
    );

    const portalAuditEvents = await db
      .select({
        action: auditEvents.action,
        metadata: auditEvents.metadata,
      })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.organizationId, scope.organizationId),
          eq(
            auditEvents.resourceType,
            "external_participant_credential",
          ),
        ),
      );
    assert.equal(
      JSON.stringify(portalAuditEvents).includes(
        submission.participantPortalSecret,
      ),
      false,
    );
    assert.equal(
      JSON.stringify(portalAuditEvents).includes(
        participantLogin.token,
      ),
      false,
    );

    const routed = await applyRoutingRules(db, scope, {
      caseId: record.id,
      actorUserId: actor.userId,
    });
    assert.equal(routed.matched, true);
    assert.equal(routed.case.assignedMembershipId, actor.membershipId);
    record = routed.case;

    const actorPermissions = (
      await listMembershipAuthorization(db, scope, actor.membershipId)
    )
      .map((entry) => entry.permission)
      .filter((permission): permission is string => Boolean(permission));

    record = await transitionCase(db, scope, {
      caseId: record.id,
      transitionKey: "advance_a_to_b",
      actorUserId: actor.userId,
      actorPermissions,
      comment: "neutral transition",
    });
    assert.equal(record.status, "state_b");

    let deadlines = await listCaseDeadlines(db, scope, record.id);
    assert.equal(deadlines.length, 1);
    assert.equal(deadlines[0].policyKey, "example_deadline");
    assert.equal(deadlines[0].status, "active");

    record = await transitionCase(db, scope, {
      caseId: record.id,
      transitionKey: "advance_b_to_c",
      actorUserId: actor.userId,
      actorPermissions,
      comment: "neutral decision transition",
    });
    assert.equal(record.status, "state_c");

    deadlines = await listCaseDeadlines(db, scope, record.id);
    assert.equal(deadlines.length, 1);
    assert.equal(deadlines[0].status, "completed");

    const [reviewPolicy] = await db
      .select()
      .from(reviewPolicies)
      .where(
        and(
          eq(reviewPolicies.organizationId, scope.organizationId),
          eq(reviewPolicies.key, "example_review"),
        ),
      )
      .limit(1);
    assert.ok(reviewPolicy);

    const review = await fileCaseReview(db, scope, {
      caseId: record.id,
      policyId: reviewPolicy.id,
      grounds: "neutral review grounds",
      requestedRelief: "neutral requested result",
      actorUserId: actor.userId,
    });

    const assignedReview = await assignReview(db, scope, {
      reviewId: review.id,
      reviewerMembershipId: reviewer.membershipId,
      actorUserId: actor.userId,
    });
    assert.equal(
      assignedReview.reviewerMembershipId,
      reviewer.membershipId,
    );

    await beginReview(db, scope, {
      reviewId: review.id,
      actorMembershipId: reviewer.membershipId,
      actorUserId: reviewer.userId,
    });

    const decidedReview = await decideReview(db, scope, {
      reviewId: review.id,
      actorMembershipId: reviewer.membershipId,
      actorUserId: reviewer.userId,
      outcome: "outcome_a",
      writtenDecision: "Neutral review decision.",
    });
    assert.equal(decidedReview.status, "decided");
    assert.equal(decidedReview.outcome, "outcome_a");

    const effect = await applyReviewDecisionToCase(db, scope, {
      reviewId: review.id,
      targetStatus: "state_d",
      actorUserId: reviewer.userId,
    });
    record = effect.case;
    assert.equal(record.status, "state_d");

    record = await transitionCase(db, scope, {
      caseId: record.id,
      transitionKey: "close_d",
      actorUserId: actor.userId,
      actorPermissions,
      comment: "neutral closure transition",
    });
    assert.equal(record.status, "state_closed");
    assert.ok(record.closedAt);

    // Updating the portable definition creates new published versions while
    // the historical submission/case remain pinned to v1.
    const changedManifestInput = structuredClone(
      manifest,
    ) as ApplicationManifest;
    changedManifestInput.forms[0].definition.intro =
      "Provide an updated example value.";
    changedManifestInput.workflows[0].definition.states =
      changedManifestInput.workflows[0].definition.states.map((state) =>
        state.key === "state_b"
          ? { ...state, label: "State B Updated" }
          : state,
      );
    const changedManifest = parseApplicationManifest(changedManifestInput);

    const changedApply = await applyApplicationManifest(
      db,
      scope,
      changedManifest,
      actor.userId,
    );
    assert.equal(changedApply.noChange, false);

    const formVersions = await db
      .select()
      .from(intakeFormVersions)
      .where(eq(intakeFormVersions.formId, form.id))
      .orderBy(asc(intakeFormVersions.versionNumber));
    assert.equal(formVersions.length, 2);
    assert.equal(formVersions[0].id, formVersionV1.id);
    assert.equal(formVersions[0].status, "superseded");
    assert.equal(formVersions[1].versionNumber, 2);
    assert.equal(formVersions[1].status, "published");

    const workflowVersions = await db
      .select()
      .from(caseWorkflowVersions)
      .where(eq(caseWorkflowVersions.workflowId, workflow.id))
      .orderBy(asc(caseWorkflowVersions.versionNumber));
    assert.equal(workflowVersions.length, 2);
    assert.equal(workflowVersions[0].id, workflowVersionV1.id);
    assert.equal(workflowVersions[0].status, "superseded");
    assert.equal(workflowVersions[1].versionNumber, 2);
    assert.equal(workflowVersions[1].status, "published");

    const [persistedSubmission] = await db
      .select()
      .from(intakeSubmissions)
      .where(eq(intakeSubmissions.id, submission.id))
      .limit(1);
    assert.ok(persistedSubmission);
    assert.equal(persistedSubmission.formVersionId, formVersionV1.id);

    const [persistedCase] = await db
      .select()
      .from(cases)
      .where(eq(cases.id, record.id))
      .limit(1);
    assert.ok(persistedCase);
    assert.equal(persistedCase.workflowVersionId, workflowVersionV1.id);
    assert.equal(persistedCase.status, "state_closed");

    await logoutExternalParticipant(db, {
      sessionToken: participantLogin.token,
    });
    assert.equal(
      await resolveExternalParticipantContext(db, {
        organizationSlug,
        sessionToken: participantLogin.token,
      }),
      null,
    );

    // The manifest must not silently claim a matching locally-created
    // resource in another organization.
    const collisionSlug = `collision-${suffix}`;
    const collisionAdmin = await bootstrapOrganizationAdministrator(db, {
      email: `collision-${suffix}@example.invalid`,
      password,
      displayName: "Collision Actor",
      organizationName: `Collision ${suffix}`,
      organizationSlug: collisionSlug,
    });
    const collisionScope = createTrustedTenantScope(
      collisionAdmin.organizationId,
    );
    await db.insert(caseQueues).values({
      organizationId: collisionScope.organizationId,
      slug: "example_queue",
      name: "Locally Created Queue",
      assignmentStrategy: "manual",
      status: "active",
      createdByUserId: collisionAdmin.userId,
    });

    await assert.rejects(
      () =>
        applyApplicationManifest(
          db,
          collisionScope,
          manifest,
          collisionAdmin.userId,
        ),
      /cannot take ownership of existing routing_queue 'example_queue'/i,
    );

    process.stdout.write(
      "Generic integration contract passed.\n",
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`Generic integration contract failed:\n${message}\n`);
  process.exitCode = 1;
});
