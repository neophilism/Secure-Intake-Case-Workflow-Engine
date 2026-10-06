import { and, eq } from "drizzle-orm";
import type {
  Database,
  DatabaseTransaction,
} from "@/db/client";
import {
  auditEvents,
  caseCommunicationThreads,
  caseCorrespondenceMessages,
  caseNoteDocumentLinks,
  caseNotes,
  cases,
  communicationTemplates,
  correspondenceMessageDocumentLinks,
  documentCaseLinks,
  documentVersions,
  documents,
} from "@/db/schema";
import type { TenantScope } from "@/lib/tenancy";
import { auditEventValues } from "@/modules/audit/event";
import { enqueueBackgroundJobInTransaction } from "@/modules/jobs/service";
import { createNotificationForUserInTransaction } from "@/modules/notifications/service";
import {
  canExposeDocumentInCommunication,
  normalizeRecipients,
  parseCommunicationChannel,
  parseCommunicationVisibility,
  requireOutboundRecipients,
  type CommunicationChannel,
  type CommunicationRecipient,
  type CommunicationVisibility,
} from "./policy";
import {
  renderCommunicationTemplate,
  validateCommunicationTemplate,
} from "./template";
import {
  assertTransportSupportsChannel,
  type CommunicationTransport,
} from "./transport";

const templateKeyPattern = /^[a-z][a-z0-9_-]*$/;

export class CommunicationNotFoundError extends Error {
  constructor(message = "Communication resource was not found.") {
    super(message);
    this.name = "CommunicationNotFoundError";
  }
}

export class CommunicationStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommunicationStateError";
  }
}

export async function createCommunicationTemplate(
  db: Database,
  scope: TenantScope,
  input: {
    key: string;
    name: string;
    channel: CommunicationChannel;
    subjectTemplate?: string | null;
    bodyTemplate: string;
    defaultVisibility: CommunicationVisibility;
    actorUserId: string;
  },
) {
  const key = input.key.trim();
  const name = input.name.trim();
  const bodyTemplate = input.bodyTemplate.trim();
  const subjectTemplate = input.subjectTemplate?.trim() || null;

  if (!templateKeyPattern.test(key) || !name || !bodyTemplate) {
    throw new Error("Communication template is invalid.");
  }

  parseCommunicationChannel(input.channel);
  parseCommunicationVisibility(input.defaultVisibility);
  validateCommunicationTemplate(bodyTemplate);
  if (subjectTemplate) validateCommunicationTemplate(subjectTemplate);

  return db.transaction(async (tx) => {
    const [template] = await tx
      .insert(communicationTemplates)
      .values({
        organizationId: scope.organizationId,
        key,
        name,
        channel: input.channel,
        subjectTemplate,
        bodyTemplate,
        defaultVisibility: input.defaultVisibility,
        createdByUserId: input.actorUserId,
      })
      .returning();

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId: input.actorUserId,
        action: "communication.template_created",
        resourceType: "communication_template",
        resourceId: template.id,
        newState: {
          key: template.key,
          channel: template.channel,
          defaultVisibility: template.defaultVisibility,
          status: template.status,
        },
      }),
    );

    return template;
  });
}

export async function createCaseNote(
  db: Database,
  scope: TenantScope,
  input: {
    caseId: string;
    visibility: CommunicationVisibility;
    body: string;
    documentVersionIds?: readonly string[];
    actorUserId: string;
  },
) {
  const visibility = parseCommunicationVisibility(input.visibility);
  const body = input.body.trim();
  if (!body) throw new Error("Case note body is required.");

  return db.transaction(async (tx) => {
    await requireCase(tx, scope, input.caseId);

    const attachments = await validateAttachmentVersions(
      tx,
      scope,
      input.caseId,
      input.documentVersionIds ?? [],
      {
        requireTrusted: visibility !== "internal",
        visibility,
      },
    );

    const [note] = await tx
      .insert(caseNotes)
      .values({
        organizationId: scope.organizationId,
        caseId: input.caseId,
        visibility,
        body,
        authorUserId: input.actorUserId,
      })
      .returning();

    if (attachments.length > 0) {
      await tx.insert(caseNoteDocumentLinks).values(
        attachments.map((attachment) => ({
          organizationId: scope.organizationId,
          noteId: note.id,
          documentVersionId: attachment.version.id,
          attachedByUserId: input.actorUserId,
        })),
      );
    }

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId: input.actorUserId,
        action: "note.created",
        resourceType: "case_note",
        resourceId: note.id,
        parentResourceType: "case",
        parentResourceId: input.caseId,
        newState: {
          visibility: note.visibility,
          status: note.status,
        },
        metadata: {
          bodyLength: body.length,
          attachmentCount: attachments.length,
        },
      }),
    );

    return note;
  });
}

export async function createOutboundCorrespondenceDraft(
  db: Database,
  scope: TenantScope,
  input: {
    caseId: string;
    threadId?: string | null;
    channel: CommunicationChannel;
    visibility?: CommunicationVisibility | null;
    subject?: string | null;
    body?: string | null;
    senderAddress?: string | null;
    recipients: readonly CommunicationRecipient[];
    templateId?: string | null;
    documentVersionIds?: readonly string[];
    actorUserId: string;
  },
) {
  const channel = parseCommunicationChannel(input.channel);
  let visibility: CommunicationVisibility | null = input.visibility
    ? parseCommunicationVisibility(input.visibility)
    : null;
  const recipients = normalizeRecipients(channel, input.recipients);
  requireOutboundRecipients(recipients);

  return db.transaction(async (tx) => {
    const caseRecord = await requireCase(tx, scope, input.caseId);

    let subject = input.subject?.trim() || null;
    let body = input.body?.trim() || "";
    let templateId: string | null = null;

    if (input.templateId) {
      const [template] = await tx
        .select()
        .from(communicationTemplates)
        .where(
          and(
            eq(communicationTemplates.id, input.templateId),
            eq(
              communicationTemplates.organizationId,
              scope.organizationId,
            ),
            eq(communicationTemplates.status, "active"),
          ),
        )
        .limit(1);

      if (!template) {
        throw new CommunicationNotFoundError(
          "Communication template was not found.",
        );
      }
      if (template.channel !== channel) {
        throw new CommunicationStateError(
          "Template channel does not match correspondence channel.",
        );
      }
      if (!visibility) {
        visibility = parseCommunicationVisibility(
          template.defaultVisibility,
        );
      }

      const values = {
        case_number: caseRecord.caseNumber,
        case_title: caseRecord.title,
        case_status: caseRecord.status,
        case_type: caseRecord.caseType,
      };

      if (!subject && template.subjectTemplate) {
        subject = renderCommunicationTemplate(
          template.subjectTemplate,
          values,
        );
      }
      if (!body) {
        body = renderCommunicationTemplate(
          template.bodyTemplate,
          values,
        );
      }
      templateId = template.id;
    }

    if (!body) {
      throw new Error("Correspondence body is required.");
    }
    if (!visibility) {
      visibility = "participant";
    }

    const thread = await resolveThread(
      tx,
      scope,
      input.caseId,
      input.threadId ?? null,
      subject,
      input.actorUserId,
    );

    const attachments = await validateAttachmentVersions(
      tx,
      scope,
      input.caseId,
      input.documentVersionIds ?? [],
      {
        requireTrusted: true,
        visibility,
      },
    );

    const [message] = await tx
      .insert(caseCorrespondenceMessages)
      .values({
        organizationId: scope.organizationId,
        caseId: input.caseId,
        threadId: thread.id,
        direction: "outbound",
        channel,
        visibility,
        status: "draft",
        subject,
        body,
        senderAddress: input.senderAddress?.trim() || null,
        recipients,
        templateId,
        createdByUserId: input.actorUserId,
      })
      .returning();

    await attachMessageDocuments(
      tx,
      scope,
      message.id,
      attachments,
      input.actorUserId,
    );

    await tx
      .update(caseCommunicationThreads)
      .set({ updatedAt: new Date() })
      .where(eq(caseCommunicationThreads.id, thread.id));

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId: input.actorUserId,
        action: "correspondence.draft_created",
        resourceType: "correspondence_message",
        resourceId: message.id,
        parentResourceType: "case",
        parentResourceId: input.caseId,
        newState: {
          direction: message.direction,
          channel: message.channel,
          visibility: message.visibility,
          status: message.status,
        },
        metadata: {
          threadId: thread.id,
          recipientCount: recipients.length,
          attachmentCount: attachments.length,
          bodyLength: body.length,
          templateId,
        },
      }),
    );

    return message;
  });
}

export async function queueOutboundCorrespondence(
  db: Database,
  scope: TenantScope,
  input: {
    messageId: string;
    actorUserId: string;
  },
) {
  const now = new Date();

  return db.transaction(async (tx) => {
    const message = await requireMessage(
      tx,
      scope,
      input.messageId,
    );

    if (
      message.direction !== "outbound" ||
      (message.status !== "draft" && message.status !== "failed")
    ) {
      throw new CommunicationStateError(
        "Only outbound draft or failed correspondence can be queued.",
      );
    }

    const [updated] = await tx
      .update(caseCorrespondenceMessages)
      .set({
        status: "queued",
        queuedAt: now,
        failureMessage: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(caseCorrespondenceMessages.id, message.id),
          eq(
            caseCorrespondenceMessages.organizationId,
            scope.organizationId,
          ),
        ),
      )
      .returning();

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId: input.actorUserId,
        action: "correspondence.queued",
        resourceType: "correspondence_message",
        resourceId: message.id,
        parentResourceType: "case",
        parentResourceId: message.caseId,
        previousState: { status: message.status },
        newState: { status: updated.status },
        metadata: {
          channel: message.channel,
          recipientCount: message.recipients.length,
        },
      }),
    );

    await enqueueBackgroundJobInTransaction(tx, scope, {
      jobType: "correspondence.deliver",
      payload: { messageId: message.id },
      priority: 40,
      maxAttempts: 5,
      dedupeKey:
        `correspondence-delivery:${message.id}:${now.toISOString()}`,
      availableAt: now,
    });

    return updated;
  });
}

export async function recordOutboundCorrespondenceSent(
  db: Database,
  scope: TenantScope,
  input: {
    messageId: string;
    actorUserId?: string | null;
    provider: string;
    externalMessageId?: string | null;
    deliveryMetadata?: Record<string, unknown>;
    sentAt?: Date;
  },
) {
  const sentAt = input.sentAt ?? new Date();
  const provider = input.provider.trim();
  if (!provider) throw new Error("Delivery provider is required.");

  return db.transaction(async (tx) => {
    const message = await requireMessage(
      tx,
      scope,
      input.messageId,
    );

    if (
      message.direction !== "outbound" ||
      message.status !== "queued"
    ) {
      throw new CommunicationStateError(
        "Only queued outbound correspondence can be marked sent.",
      );
    }

    const [updated] = await tx
      .update(caseCorrespondenceMessages)
      .set({
        status: "sent",
        sentAt,
        deliveryProvider: provider,
        externalMessageId: input.externalMessageId?.trim() || null,
        deliveryMetadata: input.deliveryMetadata ?? {},
        failureMessage: null,
        updatedAt: sentAt,
      })
      .where(
        and(
          eq(caseCorrespondenceMessages.id, message.id),
          eq(
            caseCorrespondenceMessages.organizationId,
            scope.organizationId,
          ),
        ),
      )
      .returning();

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: input.actorUserId ? "user" : "system",
        actorUserId: input.actorUserId ?? null,
        action: "correspondence.sent",
        resourceType: "correspondence_message",
        resourceId: message.id,
        parentResourceType: "case",
        parentResourceId: message.caseId,
        previousState: { status: message.status },
        newState: {
          status: updated.status,
          sentAt: updated.sentAt?.toISOString() ?? null,
        },
        metadata: {
          provider,
          channel: message.channel,
          recipientCount: message.recipients.length,
        },
        occurredAt: sentAt,
      }),
    );

    return updated;
  });
}

export async function recordOutboundCorrespondenceFailure(
  db: Database,
  scope: TenantScope,
  input: {
    messageId: string;
    provider: string;
    failureMessage: string;
  },
) {
  const now = new Date();

  return db.transaction(async (tx) => {
    const message = await requireMessage(
      tx,
      scope,
      input.messageId,
    );

    if (
      message.direction !== "outbound" ||
      message.status !== "queued"
    ) {
      throw new CommunicationStateError(
        "Only queued outbound correspondence can fail delivery.",
      );
    }

    const [updated] = await tx
      .update(caseCorrespondenceMessages)
      .set({
        status: "failed",
        deliveryProvider: input.provider.trim() || "unknown",
        failureMessage: input.failureMessage.trim().slice(0, 2000),
        updatedAt: now,
      })
      .where(eq(caseCorrespondenceMessages.id, message.id))
      .returning();

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "system",
        action: "correspondence.delivery_failed",
        resourceType: "correspondence_message",
        resourceId: message.id,
        parentResourceType: "case",
        parentResourceId: message.caseId,
        previousState: { status: message.status },
        newState: { status: updated.status },
        metadata: {
          provider: updated.deliveryProvider,
          channel: message.channel,
        },
      }),
    );

    if (message.createdByUserId) {
      await createNotificationForUserInTransaction(
        tx,
        scope,
        message.createdByUserId,
        {
          eventType: "correspondence.delivery_failed",
          severity: "warning",
          title: "Correspondence delivery failed",
          body:
            "An outbound case correspondence message could not be delivered.",
          link: `/admin/cases/${message.caseId}`,
          resourceType: "correspondence_message",
          resourceId: message.id,
        },
      );
    }

    return updated;
  });
}

export async function deliverQueuedCorrespondence(
  db: Database,
  scope: TenantScope,
  messageId: string,
  transport: CommunicationTransport,
  options: { recordFailure?: boolean } = {},
) {
  const message = await db.transaction((tx) =>
    requireMessage(tx, scope, messageId),
  );
  if (message.direction !== "outbound") {
    throw new CommunicationStateError(
      "Only outbound correspondence can be delivered.",
    );
  }
  if (message.status === "sent") {
    return message;
  }
  if (message.status !== "queued") {
    throw new CommunicationStateError(
      "Correspondence must be queued before delivery.",
    );
  }

  const channel = parseCommunicationChannel(message.channel);
  assertTransportSupportsChannel(transport, channel);

  let result;
  try {
    const attachments = await loadMessageDeliveryAttachments(
      db,
      scope,
      message.id,
    );

    result = await transport.send({
      idempotencyKey: message.id,
      channel,
      senderAddress: message.senderAddress,
      recipients: message.recipients,
      subject: message.subject,
      body: message.body,
      attachments,
    });
  } catch (error) {
    if (options.recordFailure ?? true) {
      await recordOutboundCorrespondenceFailure(db, scope, {
        messageId: message.id,
        provider: transport.provider,
        failureMessage:
          error instanceof Error
            ? error.message
            : "Unknown communication delivery failure.",
      });
    }
    throw error;
  }

  return recordOutboundCorrespondenceSent(db, scope, {
    messageId: message.id,
    actorUserId: null,
    provider: transport.provider,
    externalMessageId: result.externalMessageId,
    deliveryMetadata: result.metadata,
  });
}

export async function recordInboundCorrespondence(
  db: Database,
  scope: TenantScope,
  input: {
    caseId: string;
    threadId?: string | null;
    inReplyToMessageId?: string | null;
    channel: CommunicationChannel;
    visibility: CommunicationVisibility;
    subject?: string | null;
    body: string;
    senderAddress?: string | null;
    recipients?: readonly CommunicationRecipient[];
    externalMessageId?: string | null;
    provider?: string | null;
    documentVersionIds?: readonly string[];
    actorUserId?: string | null;
    receivedAt?: Date;
  },
) {
  const channel = parseCommunicationChannel(input.channel);
  const visibility = parseCommunicationVisibility(input.visibility);
  const recipients = normalizeRecipients(
    channel,
    input.recipients ?? [],
  );
  const body = input.body.trim();
  const provider = input.provider?.trim() || "manual-record";
  if (!body) throw new Error("Inbound correspondence body is required.");

  return db.transaction(async (tx) => {
    await requireCase(tx, scope, input.caseId);

    if (input.externalMessageId?.trim()) {
      const [existing] = await tx
        .select()
        .from(caseCorrespondenceMessages)
        .where(
          and(
            eq(
              caseCorrespondenceMessages.organizationId,
              scope.organizationId,
            ),
            eq(
              caseCorrespondenceMessages.externalMessageId,
              input.externalMessageId.trim(),
            ),
            eq(
              caseCorrespondenceMessages.deliveryProvider,
              provider,
            ),
          ),
        )
        .limit(1);

      if (existing) {
        if (existing.caseId !== input.caseId) {
          throw new CommunicationStateError(
            "External message ID is already associated with another case.",
          );
        }
        return existing;
      }
    }

    let replyTo:
      | typeof caseCorrespondenceMessages.$inferSelect
      | null = null;

    if (input.inReplyToMessageId) {
      replyTo = await requireMessage(
        tx,
        scope,
        input.inReplyToMessageId,
      );
      if (replyTo.caseId !== input.caseId) {
        throw new CommunicationStateError(
          "Reply target belongs to another case.",
        );
      }
    }

    const requestedThreadId =
      input.threadId ?? replyTo?.threadId ?? null;

    const thread = await resolveThread(
      tx,
      scope,
      input.caseId,
      requestedThreadId,
      input.subject?.trim() || replyTo?.subject || null,
      input.actorUserId ?? null,
    );

    if (replyTo && replyTo.threadId !== thread.id) {
      throw new CommunicationStateError(
        "Reply target belongs to another communication thread.",
      );
    }

    const attachments = await validateAttachmentVersions(
      tx,
      scope,
      input.caseId,
      input.documentVersionIds ?? [],
      {
        requireTrusted: true,
        visibility,
      },
    );

    const receivedAt = input.receivedAt ?? new Date();
    const [message] = await tx
      .insert(caseCorrespondenceMessages)
      .values({
        organizationId: scope.organizationId,
        caseId: input.caseId,
        threadId: thread.id,
        direction: "inbound",
        channel,
        visibility,
        status: "received",
        subject: input.subject?.trim() || replyTo?.subject || null,
        body,
        senderAddress: input.senderAddress?.trim() || null,
        recipients,
        externalMessageId: input.externalMessageId?.trim() || null,
        inReplyToMessageId: replyTo?.id ?? null,
        createdByUserId: input.actorUserId ?? null,
        receivedAt,
        deliveryProvider: provider,
      })
      .returning();

    await attachMessageDocuments(
      tx,
      scope,
      message.id,
      attachments,
      input.actorUserId ?? null,
    );

    await tx
      .update(caseCommunicationThreads)
      .set({ updatedAt: receivedAt })
      .where(eq(caseCommunicationThreads.id, thread.id));

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: input.actorUserId ? "user" : "system",
        actorUserId: input.actorUserId ?? null,
        action: "correspondence.received",
        resourceType: "correspondence_message",
        resourceId: message.id,
        parentResourceType: "case",
        parentResourceId: input.caseId,
        newState: {
          direction: message.direction,
          channel: message.channel,
          visibility: message.visibility,
          status: message.status,
          receivedAt: receivedAt.toISOString(),
        },
        metadata: {
          threadId: thread.id,
          replyToMessageId: replyTo?.id ?? null,
          recipientCount: recipients.length,
          attachmentCount: attachments.length,
          bodyLength: body.length,
          provider: message.deliveryProvider,
        },
        occurredAt: receivedAt,
      }),
    );

    return message;
  });
}

async function requireCase(
  tx: DatabaseTransaction,
  scope: TenantScope,
  caseId: string,
) {
  const [record] = await tx
    .select()
    .from(cases)
    .where(
      and(
        eq(cases.id, caseId),
        eq(cases.organizationId, scope.organizationId),
      ),
    )
    .limit(1);

  if (!record) {
    throw new CommunicationNotFoundError("Case was not found.");
  }
  return record;
}

async function requireMessage(
  db: DatabaseTransaction,
  scope: TenantScope,
  messageId: string,
) {
  const [message] = await db
    .select()
    .from(caseCorrespondenceMessages)
    .where(
      and(
        eq(caseCorrespondenceMessages.id, messageId),
        eq(
          caseCorrespondenceMessages.organizationId,
          scope.organizationId,
        ),
      ),
    )
    .limit(1);

  if (!message) {
    throw new CommunicationNotFoundError(
      "Correspondence message was not found.",
    );
  }
  return message;
}

async function resolveThread(
  tx: DatabaseTransaction,
  scope: TenantScope,
  caseId: string,
  threadId: string | null,
  subject: string | null,
  actorUserId: string | null,
) {
  if (threadId) {
    const [thread] = await tx
      .select()
      .from(caseCommunicationThreads)
      .where(
        and(
          eq(caseCommunicationThreads.id, threadId),
          eq(
            caseCommunicationThreads.organizationId,
            scope.organizationId,
          ),
          eq(caseCommunicationThreads.caseId, caseId),
        ),
      )
      .limit(1);

    if (!thread) {
      throw new CommunicationNotFoundError(
        "Communication thread was not found.",
      );
    }
    return thread;
  }

  const [thread] = await tx
    .insert(caseCommunicationThreads)
    .values({
      organizationId: scope.organizationId,
      caseId,
      subject,
      createdByUserId: actorUserId,
    })
    .returning();

  return thread;
}

async function validateAttachmentVersions(
  tx: DatabaseTransaction,
  scope: TenantScope,
  caseId: string,
  versionIds: readonly string[],
  policy: {
    requireTrusted: boolean;
    visibility: CommunicationVisibility;
  },
) {
  const uniqueIds = [...new Set(versionIds.filter(Boolean))];
  const attachments: Array<{
    version: typeof documentVersions.$inferSelect;
    document: typeof documents.$inferSelect;
  }> = [];

  for (const versionId of uniqueIds) {
    const [attachment] = await tx
      .select({
        version: documentVersions,
        document: documents,
      })
      .from(documentCaseLinks)
      .innerJoin(
        documentVersions,
        and(
          eq(
            documentVersions.id,
            documentCaseLinks.documentVersionId,
          ),
          eq(
            documentVersions.organizationId,
            documentCaseLinks.organizationId,
          ),
        ),
      )
      .innerJoin(
        documents,
        and(
          eq(documents.id, documentVersions.documentId),
          eq(
            documents.organizationId,
            documentCaseLinks.organizationId,
          ),
        ),
      )
      .where(
        and(
          eq(documentCaseLinks.organizationId, scope.organizationId),
          eq(documentCaseLinks.caseId, caseId),
          eq(documentCaseLinks.documentVersionId, versionId),
        ),
      )
      .limit(1);

    if (!attachment) {
      throw new CommunicationStateError(
        "Communication attachment must already be linked to the case.",
      );
    }

    if (
      policy.requireTrusted &&
      (attachment.version.contentStatus !== "available" ||
        attachment.version.malwareScanStatus !== "clean")
    ) {
      throw new CommunicationStateError(
        "Communication attachments must be clean and available.",
      );
    }

    if (
      !canExposeDocumentInCommunication(
        policy.visibility,
        attachment.document.visibility,
      )
    ) {
      throw new CommunicationStateError(
        "Document visibility is incompatible with communication visibility.",
      );
    }

    attachments.push(attachment);
  }

  return attachments;
}

async function attachMessageDocuments(
  tx: DatabaseTransaction,
  scope: TenantScope,
  messageId: string,
  attachments: Array<{
    version: typeof documentVersions.$inferSelect;
    document: typeof documents.$inferSelect;
  }>,
  actorUserId: string | null,
) {
  if (attachments.length === 0) return;

  await tx.insert(correspondenceMessageDocumentLinks).values(
    attachments.map((attachment) => ({
      organizationId: scope.organizationId,
      messageId,
      documentVersionId: attachment.version.id,
      attachedByUserId: actorUserId,
    })),
  );
}

async function loadMessageDeliveryAttachments(
  db: Database,
  scope: TenantScope,
  messageId: string,
) {
  const rows = await db
    .select({
      version: documentVersions,
    })
    .from(correspondenceMessageDocumentLinks)
    .innerJoin(
      documentVersions,
      and(
        eq(
          documentVersions.id,
          correspondenceMessageDocumentLinks.documentVersionId,
        ),
        eq(
          documentVersions.organizationId,
          correspondenceMessageDocumentLinks.organizationId,
        ),
      ),
    )
    .where(
      and(
        eq(
          correspondenceMessageDocumentLinks.organizationId,
          scope.organizationId,
        ),
        eq(
          correspondenceMessageDocumentLinks.messageId,
          messageId,
        ),
      ),
    );

  for (const row of rows) {
    if (
      row.version.contentStatus !== "available" ||
      row.version.malwareScanStatus !== "clean"
    ) {
      throw new CommunicationStateError(
        "A queued attachment is no longer clean and available.",
      );
    }
  }

  return rows.map(({ version }) => ({
    documentVersionId: version.id,
    filename: version.originalFilename,
    mimeType: version.mimeType,
    sha256: version.sha256,
  }));
}
