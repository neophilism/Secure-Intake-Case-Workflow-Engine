"use server";

import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import {
  parseCasePriority,
  TransitionGuardError,
  transitionCase,
  updateCaseMetadata,
} from "@/modules/cases/service";
import {
  applyRoutingRules,
  escalateCase,
  manualAssignCase,
} from "@/modules/routing/service";
import {
  recordCustodyEvent,
  recordMalwareScanResult,
} from "@/modules/documents/service";
import { listCaseDocuments } from "@/modules/documents/repository";
import { canViewDocumentVisibility } from "@/modules/documents/policy";
import {
  cancelDeadline,
  completeDeadline,
  extendDeadline,
  pauseDeadline,
  resumeDeadline,
} from "@/modules/deadlines/service";
import {
  createCaseNote,
  createOutboundCorrespondenceDraft,
  queueOutboundCorrespondence,
  recordInboundCorrespondence,
  recordOutboundCorrespondenceSent,
} from "@/modules/communications/service";
import {
  parseCommunicationChannel,
  parseCommunicationVisibility,
  parseRecipientText,
} from "@/modules/communications/policy";
import {
  applyReviewDecisionToCase,
  assignReview,
  beginReview,
  decideReview,
  fileCaseReview,
  withdrawReview,
} from "@/modules/reviews/service";
import {
  decideProtectedReveal,
  requestProtectedReveal,
} from "@/modules/protected-data/service";
import { getCaseParticipantMessagingCapability } from "@/modules/participant-portal/service";
import {
  acknowledgeCaseReferral,
  cancelCaseReferral,
  completeCaseReferral,
  createCaseReferral,
  recordCaseReferralResponse,
  sendCaseReferral,
} from "@/modules/referrals/service";

async function requireCaseContext() {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope) redirect("/select-organization");
  return context;
}

async function requireCommunicationAttachmentAccess(
  caseId: string,
  versionIds: readonly string[],
  context: Awaited<ReturnType<typeof requireCaseContext>>,
) {
  if (versionIds.length === 0) return;

  const records = await listCaseDocuments(
    getRuntimeDatabase(),
    requireTenantScope(context),
    caseId,
  );
  const allowed = new Set(
    records
      .filter(({ document }) =>
        canViewDocumentVisibility(
          document.visibility,
          context.permissions,
        ),
      )
      .map(({ version }) => version.id),
  );

  if (versionIds.some((versionId) => !allowed.has(versionId))) {
    redirect("/forbidden");
  }
}

export async function updateCaseMetadataAction(
  caseId: string,
  formData: FormData,
) {
  const context = await requireCaseContext();
  if (!hasPermission(context, "case:update")) {
    redirect("/forbidden");
  }

  const title = String(formData.get("title") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  const disposition = String(
    formData.get("disposition") ?? "",
  ).trim();
  const rawPriority = String(
    formData.get("priority") ?? "",
  ).trim();
  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((tag) => tag.trim());

  if (!title) {
    redirect(`/admin/cases/${caseId}?error=invalid_metadata`);
  }

  try {
    await updateCaseMetadata(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        caseId,
        title,
        summary: summary || null,
        disposition: disposition || null,
        priority: parseCasePriority(rawPriority),
        tags,
        actorUserId: context.user.id,
      },
    );
  } catch {
    redirect(`/admin/cases/${caseId}?error=update_failed`);
  }

  redirect(`/admin/cases/${caseId}`);
}

export async function transitionCaseAction(
  caseId: string,
  formData: FormData,
) {
  const context = await requireCaseContext();
  const transitionKey = String(
    formData.get("transitionKey") ?? "",
  ).trim();
  const comment = String(formData.get("comment") ?? "").trim();
  const disposition = String(
    formData.get("disposition") ?? "",
  ).trim();

  if (!transitionKey) {
    redirect(`/admin/cases/${caseId}?error=invalid_transition`);
  }

  try {
    await transitionCase(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        caseId,
        transitionKey,
        actorUserId: context.user.id,
        actorPermissions: [...context.permissions],
        comment: comment || null,
        disposition: disposition || undefined,
      },
    );
  } catch (error) {
    if (
      error instanceof TransitionGuardError &&
      error.failures.some(
        (failure) => failure.code === "missing_permission",
      )
    ) {
      redirect("/forbidden");
    }

    if (error instanceof TransitionGuardError) {
      redirect(
        `/admin/cases/${caseId}?error=transition_requirements`,
      );
    }

    redirect(`/admin/cases/${caseId}?error=transition_failed`);
  }

  redirect(`/admin/cases/${caseId}`);
}


export async function manualAssignCaseAction(
  caseId: string,
  formData: FormData,
) {
  const context = await requireCaseContext();
  if (!hasPermission(context, "case:assign")) {
    redirect("/forbidden");
  }

  const queueId = String(formData.get("queueId") ?? "").trim();
  const membershipId = String(
    formData.get("membershipId") ?? "",
  ).trim();
  const reason = String(formData.get("reason") ?? "").trim();

  try {
    await manualAssignCase(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        caseId,
        queueId: queueId || null,
        membershipId: membershipId || null,
        actorUserId: context.user.id,
        reason: reason || null,
      },
    );
  } catch {
    redirect(`/admin/cases/${caseId}?error=assignment_failed`);
  }

  redirect(`/admin/cases/${caseId}`);
}

export async function applyRoutingRulesAction(
  caseId: string,
  _formData: FormData,
) {
  const context = await requireCaseContext();
  if (
    !hasPermission(context, "case:assign") ||
    !hasPermission(context, "routing:view")
  ) {
    redirect("/forbidden");
  }

  let matched = false;
  try {
    const result = await applyRoutingRules(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        caseId,
        actorUserId: context.user.id,
      },
    );
    matched = result.matched;
  } catch {
    redirect(`/admin/cases/${caseId}?error=routing_failed`);
  }

  redirect(
    matched
      ? `/admin/cases/${caseId}`
      : `/admin/cases/${caseId}?error=no_routing_match`,
  );
}

export async function escalateCaseAction(
  caseId: string,
  formData: FormData,
) {
  const context = await requireCaseContext();
  if (!hasPermission(context, "case:assign")) {
    redirect("/forbidden");
  }

  const reason = String(formData.get("reason") ?? "").trim();
  const targetQueueId = String(
    formData.get("targetQueueId") ?? "",
  ).trim();
  const priorityRaw = String(
    formData.get("priority") ?? "",
  ).trim();

  if (!reason) {
    redirect(`/admin/cases/${caseId}?error=invalid_escalation`);
  }

  const priority =
    priorityRaw === "low" ||
    priorityRaw === "normal" ||
    priorityRaw === "high" ||
    priorityRaw === "critical"
      ? priorityRaw
      : undefined;

  try {
    await escalateCase(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        caseId,
        actorUserId: context.user.id,
        reason,
        targetQueueId: targetQueueId || null,
        priority,
      },
    );
  } catch {
    redirect(`/admin/cases/${caseId}?error=escalation_failed`);
  }

  redirect(`/admin/cases/${caseId}`);
}


export async function recordDocumentScanAction(
  caseId: string,
  versionId: string,
  formData: FormData,
) {
  const context = await requireCaseContext();
  if (!hasPermission(context, "document:scan_manage")) {
    redirect("/forbidden");
  }

  const status = String(formData.get("status") ?? "").trim();
  const provider = String(
    formData.get("provider") ?? "manual-record",
  ).trim();

  if (
    status !== "pending" &&
    status !== "clean" &&
    status !== "infected" &&
    status !== "failed"
  ) {
    redirect(`/admin/cases/${caseId}?error=invalid_scan_status`);
  }

  try {
    await recordMalwareScanResult(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        versionId,
        status,
        provider: provider || "manual-record",
        actorUserId: context.user.id,
        details: {
          recordedThrough: "case_admin",
        },
      },
    );
  } catch {
    redirect(`/admin/cases/${caseId}?error=scan_update_failed`);
  }

  redirect(`/admin/cases/${caseId}`);
}

export async function recordDocumentCustodyAction(
  caseId: string,
  versionId: string,
  formData: FormData,
) {
  const context = await requireCaseContext();
  if (!hasPermission(context, "document:manage")) {
    redirect("/forbidden");
  }

  const action = String(formData.get("action") ?? "").trim();
  const fromCustodian = String(
    formData.get("fromCustodian") ?? "",
  ).trim();
  const toCustodian = String(
    formData.get("toCustodian") ?? "",
  ).trim();
  const location = String(
    formData.get("location") ?? "",
  ).trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!action) {
    redirect(`/admin/cases/${caseId}?error=invalid_custody_event`);
  }

  try {
    await recordCustodyEvent(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        versionId,
        action,
        fromCustodian: fromCustodian || null,
        toCustodian: toCustodian || null,
        location: location || null,
        note: note || null,
        actorUserId: context.user.id,
      },
    );
  } catch {
    redirect(`/admin/cases/${caseId}?error=custody_update_failed`);
  }

  redirect(`/admin/cases/${caseId}`);
}


async function runDeadlineOperation(
  caseId: string,
  deadlineId: string,
  formData: FormData,
  operation: "pause" | "resume" | "complete" | "cancel",
) {
  const context = await requireCaseContext();
  if (!hasPermission(context, "deadline:operate")) {
    redirect("/forbidden");
  }

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) {
    redirect(`/admin/cases/${caseId}?error=deadline_reason_required`);
  }

  const common = {
    deadlineId,
    actorUserId: context.user.id,
    reason,
  };

  try {
    if (operation === "pause") {
      await pauseDeadline(
        getRuntimeDatabase(),
        requireTenantScope(context),
        common,
      );
    } else if (operation === "resume") {
      await resumeDeadline(
        getRuntimeDatabase(),
        requireTenantScope(context),
        common,
      );
    } else if (operation === "complete") {
      await completeDeadline(
        getRuntimeDatabase(),
        requireTenantScope(context),
        common,
      );
    } else {
      await cancelDeadline(
        getRuntimeDatabase(),
        requireTenantScope(context),
        common,
      );
    }
  } catch {
    redirect(`/admin/cases/${caseId}?error=deadline_${operation}_failed`);
  }

  redirect(`/admin/cases/${caseId}`);
}

export async function pauseDeadlineAction(
  caseId: string,
  deadlineId: string,
  formData: FormData,
) {
  return runDeadlineOperation(
    caseId,
    deadlineId,
    formData,
    "pause",
  );
}

export async function resumeDeadlineAction(
  caseId: string,
  deadlineId: string,
  formData: FormData,
) {
  return runDeadlineOperation(
    caseId,
    deadlineId,
    formData,
    "resume",
  );
}

export async function completeDeadlineAction(
  caseId: string,
  deadlineId: string,
  formData: FormData,
) {
  return runDeadlineOperation(
    caseId,
    deadlineId,
    formData,
    "complete",
  );
}

export async function cancelDeadlineAction(
  caseId: string,
  deadlineId: string,
  formData: FormData,
) {
  return runDeadlineOperation(
    caseId,
    deadlineId,
    formData,
    "cancel",
  );
}


export async function extendDeadlineAction(
  caseId: string,
  deadlineId: string,
  formData: FormData,
) {
  const context = await requireCaseContext();
  if (!hasPermission(context, "deadline:operate")) {
    redirect("/forbidden");
  }

  const reason = String(formData.get("reason") ?? "").trim();
  const value = Number(formData.get("extensionValue") ?? "");
  const unit = String(formData.get("extensionUnit") ?? "").trim();

  if (
    !reason ||
    !Number.isInteger(value) ||
    value < 1 ||
    !["hours", "calendar_days", "business_days"].includes(unit)
  ) {
    redirect(
      `/admin/cases/${caseId}?error=deadline_extension_invalid`,
    );
  }

  try {
    await extendDeadline(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        deadlineId,
        actorUserId: context.user.id,
        reason,
        extension: {
          value,
          unit: unit as
            | "hours"
            | "calendar_days"
            | "business_days",
        },
      },
    );
  } catch {
    redirect(
      `/admin/cases/${caseId}?error=deadline_extend_failed`,
    );
  }

  redirect(`/admin/cases/${caseId}`);
}

export async function createReferralAction(
  caseId: string,
  formData: FormData,
) {
  const context = await requireCaseContext();
  if (!hasPermission(context, "referral:manage")) {
    redirect("/forbidden");
  }

  const policyKey = String(formData.get("policyKey") ?? "").trim();
  const recipientKey = String(
    formData.get("recipientKey") ?? "",
  ).trim();
  const recipientName = String(
    formData.get("recipientName") ?? "",
  ).trim();
  const externalReference = String(
    formData.get("externalReference") ?? "",
  ).trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();

  if (!policyKey || !recipientName) {
    redirect(`/admin/cases/${caseId}?error=referral_invalid`);
  }

  try {
    await createCaseReferral(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        caseId,
        policyKey,
        recipientKey: recipientKey || null,
        recipientName,
        externalReference: externalReference || null,
        subject: subject || null,
        summary: summary || null,
        actorUserId: context.user.id,
      },
    );
  } catch {
    redirect(`/admin/cases/${caseId}?error=referral_create_failed`);
  }

  redirect(`/admin/cases/${caseId}`);
}

export async function sendReferralAction(
  caseId: string,
  referralId: string,
  formData: FormData,
) {
  const context = await requireCaseContext();
  if (!hasPermission(context, "referral:manage")) {
    redirect("/forbidden");
  }
  const note = String(formData.get("note") ?? "").trim();

  try {
    await sendCaseReferral(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        referralId,
        actorUserId: context.user.id,
        note: note || null,
      },
    );
  } catch {
    redirect(`/admin/cases/${caseId}?error=referral_send_failed`);
  }
  redirect(`/admin/cases/${caseId}`);
}

export async function acknowledgeReferralAction(
  caseId: string,
  referralId: string,
  formData: FormData,
) {
  const context = await requireCaseContext();
  if (!hasPermission(context, "referral:manage")) {
    redirect("/forbidden");
  }
  const summary = String(formData.get("summary") ?? "").trim();
  const externalReference = String(
    formData.get("externalReference") ?? "",
  ).trim();

  try {
    await acknowledgeCaseReferral(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        referralId,
        actorUserId: context.user.id,
        summary: summary || null,
        externalReference: externalReference || null,
      },
    );
  } catch {
    redirect(
      `/admin/cases/${caseId}?error=referral_acknowledge_failed`,
    );
  }
  redirect(`/admin/cases/${caseId}`);
}

export async function recordReferralResponseAction(
  caseId: string,
  referralId: string,
  formData: FormData,
) {
  const context = await requireCaseContext();
  if (!hasPermission(context, "referral:manage")) {
    redirect("/forbidden");
  }

  const responseType = String(
    formData.get("responseType") ?? "",
  ).trim();
  const summary = String(formData.get("summary") ?? "").trim();

  if (
    !summary ||
    ![
      "preliminary_response",
      "status_update",
      "final_response",
    ].includes(responseType)
  ) {
    redirect(
      `/admin/cases/${caseId}?error=referral_response_invalid`,
    );
  }

  try {
    await recordCaseReferralResponse(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        referralId,
        responseType: responseType as
          | "preliminary_response"
          | "status_update"
          | "final_response",
        summary,
        actorUserId: context.user.id,
      },
    );
  } catch {
    redirect(
      `/admin/cases/${caseId}?error=referral_response_failed`,
    );
  }
  redirect(`/admin/cases/${caseId}`);
}

export async function finalizeReferralAction(
  caseId: string,
  referralId: string,
  formData: FormData,
) {
  const context = await requireCaseContext();
  if (!hasPermission(context, "referral:manage")) {
    redirect("/forbidden");
  }
  const operation = String(formData.get("operation") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason || !["complete", "cancel"].includes(operation)) {
    redirect(
      `/admin/cases/${caseId}?error=referral_finalize_invalid`,
    );
  }

  try {
    const service =
      operation === "complete"
        ? completeCaseReferral
        : cancelCaseReferral;
    await service(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        referralId,
        actorUserId: context.user.id,
        reason,
      },
    );
  } catch {
    redirect(
      `/admin/cases/${caseId}?error=referral_finalize_failed`,
    );
  }
  redirect(`/admin/cases/${caseId}`);
}

export async function createCaseNoteAction(
  caseId: string,
  formData: FormData,
) {
  const context = await requireCaseContext();
  const visibility = parseCommunicationVisibility(
    String(formData.get("visibility") ?? "internal"),
  );

  const permission =
    visibility === "internal"
      ? "note:create_internal"
      : "note:create_participant";
  if (
    !hasPermission(context, "case:view") ||
    !hasPermission(context, permission)
  ) {
    redirect("/forbidden");
  }

  const body = String(formData.get("body") ?? "").trim();
  const documentVersionIds = formData
    .getAll("documentVersionIds")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (!body) {
    redirect(`/admin/cases/${caseId}?error=note_body_required`);
  }

  await requireCommunicationAttachmentAccess(
    caseId,
    documentVersionIds,
    context,
  );

  try {
    await createCaseNote(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        caseId,
        visibility,
        body,
        documentVersionIds,
        actorUserId: context.user.id,
      },
    );
  } catch {
    redirect(`/admin/cases/${caseId}?error=note_create_failed`);
  }

  redirect(`/admin/cases/${caseId}`);
}

export async function createOutboundCorrespondenceAction(
  caseId: string,
  formData: FormData,
) {
  const context = await requireCaseContext();
  if (
    !hasPermission(context, "case:view") ||
    !hasPermission(context, "correspondence:manage")
  ) {
    redirect("/forbidden");
  }

  const channel = parseCommunicationChannel(
    String(formData.get("channel") ?? "email"),
  );
  const visibilityRaw = String(
    formData.get("visibility") ?? "",
  ).trim();
  const visibility = visibilityRaw
    ? parseCommunicationVisibility(visibilityRaw)
    : null;
  const recipients = parseRecipientText(channel, {
    to: String(formData.get("to") ?? ""),
    cc: String(formData.get("cc") ?? ""),
    bcc: String(formData.get("bcc") ?? ""),
  });
  const documentVersionIds = formData
    .getAll("documentVersionIds")
    .map((value) => String(value).trim())
    .filter(Boolean);

  await requireCommunicationAttachmentAccess(
    caseId,
    documentVersionIds,
    context,
  );

  if (channel === "portal") {
    const capability = await getCaseParticipantMessagingCapability(
      getRuntimeDatabase(),
      requireTenantScope(context),
      caseId,
    );
    if (!capability.allowMessaging) {
      redirect(
        `/admin/cases/${caseId}?error=participant_messaging_unavailable`,
      );
    }
  }

  try {
    await createOutboundCorrespondenceDraft(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        caseId,
        threadId:
          String(formData.get("threadId") ?? "").trim() || null,
        channel,
        visibility,
        subject:
          String(formData.get("subject") ?? "").trim() || null,
        body: String(formData.get("body") ?? "").trim() || null,
        senderAddress:
          String(formData.get("senderAddress") ?? "").trim() || null,
        recipients,
        templateId:
          String(formData.get("templateId") ?? "").trim() || null,
        documentVersionIds,
        actorUserId: context.user.id,
      },
    );
  } catch {
    redirect(
      `/admin/cases/${caseId}?error=correspondence_draft_failed`,
    );
  }

  redirect(`/admin/cases/${caseId}`);
}

export async function queueCorrespondenceAction(
  caseId: string,
  messageId: string,
  channel: string,
  _formData: FormData,
) {
  const context = await requireCaseContext();
  if (
    !hasPermission(context, "case:view") ||
    !hasPermission(context, "correspondence:manage")
  ) {
    redirect("/forbidden");
  }

  if (channel === "portal") {
    const capability = await getCaseParticipantMessagingCapability(
      getRuntimeDatabase(),
      requireTenantScope(context),
      caseId,
    );
    if (!capability.allowMessaging) {
      redirect(
        `/admin/cases/${caseId}?error=participant_messaging_unavailable`,
      );
    }
  }

  try {
    await queueOutboundCorrespondence(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        messageId,
        actorUserId: context.user.id,
      },
    );
  } catch {
    redirect(
      `/admin/cases/${caseId}?error=correspondence_queue_failed`,
    );
  }

  redirect(`/admin/cases/${caseId}`);
}

export async function recordCorrespondenceSentAction(
  caseId: string,
  messageId: string,
  formData: FormData,
) {
  const context = await requireCaseContext();
  if (
    !hasPermission(context, "case:view") ||
    !hasPermission(context, "correspondence:manage")
  ) {
    redirect("/forbidden");
  }

  const externalMessageId = String(
    formData.get("externalMessageId") ?? "",
  ).trim();

  try {
    await recordOutboundCorrespondenceSent(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        messageId,
        actorUserId: context.user.id,
        provider: "manual-record",
        externalMessageId: externalMessageId || null,
        deliveryMetadata: {
          recordedThrough: "case_admin",
        },
      },
    );
  } catch {
    redirect(
      `/admin/cases/${caseId}?error=correspondence_sent_failed`,
    );
  }

  redirect(`/admin/cases/${caseId}`);
}

export async function recordInboundCorrespondenceAction(
  caseId: string,
  formData: FormData,
) {
  const context = await requireCaseContext();
  if (
    !hasPermission(context, "case:view") ||
    !hasPermission(context, "correspondence:manage")
  ) {
    redirect("/forbidden");
  }

  const channel = parseCommunicationChannel(
    String(formData.get("channel") ?? "email"),
  );
  const visibility = parseCommunicationVisibility(
    String(
      formData.get("visibility") ?? "case_participants",
    ),
  );
  const recipients = parseRecipientText(channel, {
    to: String(formData.get("to") ?? ""),
    cc: String(formData.get("cc") ?? ""),
    bcc: String(formData.get("bcc") ?? ""),
  });
  const documentVersionIds = formData
    .getAll("documentVersionIds")
    .map((value) => String(value).trim())
    .filter(Boolean);

  await requireCommunicationAttachmentAccess(
    caseId,
    documentVersionIds,
    context,
  );

  try {
    await recordInboundCorrespondence(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        caseId,
        threadId:
          String(formData.get("threadId") ?? "").trim() || null,
        inReplyToMessageId:
          String(formData.get("inReplyToMessageId") ?? "").trim() ||
          null,
        channel,
        visibility,
        subject:
          String(formData.get("subject") ?? "").trim() || null,
        body: String(formData.get("body") ?? "").trim(),
        senderAddress:
          String(formData.get("senderAddress") ?? "").trim() || null,
        recipients,
        externalMessageId:
          String(formData.get("externalMessageId") ?? "").trim() ||
          null,
        provider:
          String(formData.get("provider") ?? "").trim() || "manual-record",
        documentVersionIds,
        actorUserId: context.user.id,
      },
    );
  } catch {
    redirect(
      `/admin/cases/${caseId}?error=correspondence_inbound_failed`,
    );
  }

  redirect(`/admin/cases/${caseId}`);
}


export async function fileCaseReviewAction(
  caseId: string,
  formData: FormData,
) {
  const context = await requireCaseContext();
  if (
    !hasPermission(context, "case:view") ||
    (!hasPermission(context, "review:file") &&
      !hasPermission(context, "case:appeal"))
  ) {
    redirect("/forbidden");
  }

  const policyId = String(
    formData.get("policyId") ?? "",
  ).trim();
  const parentReviewId = String(
    formData.get("parentReviewId") ?? "",
  ).trim();
  const grounds = String(
    formData.get("grounds") ?? "",
  ).trim();
  const requestedRelief = String(
    formData.get("requestedRelief") ?? "",
  ).trim();

  if (!policyId || !grounds) {
    redirect(
      `/admin/cases/${caseId}?error=review_filing_invalid`,
    );
  }

  try {
    await fileCaseReview(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        caseId,
        policyId,
        parentReviewId: parentReviewId || null,
        grounds,
        requestedRelief: requestedRelief || null,
        actorUserId: context.user.id,
      },
    );
  } catch {
    redirect(
      `/admin/cases/${caseId}?error=review_filing_failed`,
    );
  }

  redirect(`/admin/cases/${caseId}`);
}

export async function assignReviewAction(
  caseId: string,
  reviewId: string,
  formData: FormData,
) {
  const context = await requireCaseContext();
  if (!hasPermission(context, "review:assign")) {
    redirect("/forbidden");
  }

  const reviewerMembershipId = String(
    formData.get("reviewerMembershipId") ?? "",
  ).trim();
  if (!reviewerMembershipId) {
    redirect(
      `/admin/cases/${caseId}?error=review_assignment_invalid`,
    );
  }

  try {
    await assignReview(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        reviewId,
        reviewerMembershipId,
        actorUserId: context.user.id,
      },
    );
  } catch {
    redirect(
      `/admin/cases/${caseId}?error=review_assignment_failed`,
    );
  }

  redirect(`/admin/cases/${caseId}`);
}

export async function beginReviewAction(
  caseId: string,
  reviewId: string,
  _formData: FormData,
) {
  const context = await requireCaseContext();
  if (
    !context.membership ||
    !hasPermission(context, "review:decide")
  ) {
    redirect("/forbidden");
  }

  try {
    await beginReview(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        reviewId,
        actorMembershipId: context.membership.id,
        actorUserId: context.user.id,
      },
    );
  } catch {
    redirect(
      `/admin/cases/${caseId}?error=review_start_failed`,
    );
  }

  redirect(`/admin/cases/${caseId}`);
}

export async function decideReviewAction(
  caseId: string,
  reviewId: string,
  formData: FormData,
) {
  const context = await requireCaseContext();
  if (
    !context.membership ||
    !hasPermission(context, "review:decide")
  ) {
    redirect("/forbidden");
  }

  const outcome = String(
    formData.get("outcome") ?? "",
  ).trim();
  const writtenDecision = String(
    formData.get("writtenDecision") ?? "",
  ).trim();
  const remandInstructions = String(
    formData.get("remandInstructions") ?? "",
  ).trim();

  if (!outcome || !writtenDecision) {
    redirect(
      `/admin/cases/${caseId}?error=review_decision_invalid`,
    );
  }

  try {
    await decideReview(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        reviewId,
        actorMembershipId: context.membership.id,
        actorUserId: context.user.id,
        outcome,
        writtenDecision,
        remandInstructions: remandInstructions || null,
      },
    );
  } catch {
    redirect(
      `/admin/cases/${caseId}?error=review_decision_failed`,
    );
  }

  redirect(`/admin/cases/${caseId}`);
}

export async function withdrawReviewAction(
  caseId: string,
  reviewId: string,
  _formData: FormData,
) {
  const context = await requireCaseContext();
  if (
    !hasPermission(context, "review:file") &&
    !hasPermission(context, "case:appeal") &&
    !hasPermission(context, "review:manage")
  ) {
    redirect("/forbidden");
  }

  try {
    await withdrawReview(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        reviewId,
        actorUserId: context.user.id,
        allowManage: hasPermission(
          context,
          "review:manage",
        ),
      },
    );
  } catch {
    redirect(
      `/admin/cases/${caseId}?error=review_withdraw_failed`,
    );
  }

  redirect(`/admin/cases/${caseId}`);
}

export async function applyReviewDecisionAction(
  caseId: string,
  reviewId: string,
  formData: FormData,
) {
  const context = await requireCaseContext();
  if (
    !hasPermission(context, "review:decide") ||
    !hasPermission(context, "case:update")
  ) {
    redirect("/forbidden");
  }

  const targetStatus = String(
    formData.get("targetStatus") ?? "",
  ).trim();
  if (!targetStatus) {
    redirect(
      `/admin/cases/${caseId}?error=review_effect_invalid`,
    );
  }

  try {
    await applyReviewDecisionToCase(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        reviewId,
        targetStatus,
        actorUserId: context.user.id,
      },
    );
  } catch {
    redirect(
      `/admin/cases/${caseId}?error=review_effect_failed`,
    );
  }

  redirect(`/admin/cases/${caseId}`);
}


export async function requestProtectedRevealAction(
  caseId: string,
  compartmentId: string,
  formData: FormData,
) {
  const context = await requireCaseContext();
  if (
    !hasPermission(context, "case:view") ||
    !hasPermission(context, "protected_data:request_reveal")
  ) {
    redirect("/forbidden");
  }

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) {
    redirect(
      `/admin/cases/${caseId}?error=protected_reveal_reason_required`,
    );
  }

  try {
    await requestProtectedReveal(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        compartmentId,
        actorUserId: context.user.id,
        reason,
      },
    );
  } catch {
    redirect(
      `/admin/cases/${caseId}?error=protected_reveal_request_failed`,
    );
  }

  redirect(`/admin/cases/${caseId}`);
}

export async function decideProtectedRevealAction(
  caseId: string,
  requestId: string,
  decision: "approved" | "rejected",
  formData: FormData,
) {
  const context = await requireCaseContext();
  if (
    !hasPermission(context, "case:view") ||
    !hasPermission(context, "protected_data:approve_reveal")
  ) {
    redirect("/forbidden");
  }

  const decisionReason = String(
    formData.get("decisionReason") ?? "",
  ).trim();

  try {
    await decideProtectedReveal(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        requestId,
        actorUserId: context.user.id,
        decision,
        decisionReason: decisionReason || null,
      },
    );
  } catch {
    redirect(
      `/admin/cases/${caseId}?error=protected_reveal_decision_failed`,
    );
  }

  redirect(`/admin/cases/${caseId}`);
}
