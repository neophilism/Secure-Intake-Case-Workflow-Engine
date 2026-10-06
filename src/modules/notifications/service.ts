import { and, eq, inArray, sql } from "drizzle-orm";
import type {
  Database,
  DatabaseTransaction,
} from "@/db/client";
import {
  auditEvents,
  cases,
  notificationDeliveries,
  notificationPreferences,
  notifications,
  organizationMemberships,
  users,
} from "@/db/schema";
import type { TenantScope } from "@/lib/tenancy";
import { auditEventValues } from "@/modules/audit/event";
import {
  enqueueBackgroundJobInTransaction,
} from "@/modules/jobs/service";
import {
  parseNotificationChannel,
  requireNotificationEventType,
  validateNotificationDestination,
  type NotificationChannel,
  type NotificationSeverity,
} from "./policy";

export interface NotificationInput {
  eventType: string;
  severity?: NotificationSeverity;
  title: string;
  body: string;
  link?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
}

export async function createNotificationForMembership(
  db: Database,
  scope: TenantScope,
  membershipId: string,
  input: NotificationInput,
) {
  return db.transaction((tx) =>
    createNotificationForMembershipInTransaction(
      tx,
      scope,
      membershipId,
      input,
    ),
  );
}

export async function createNotificationForMembershipInTransaction(
  tx: DatabaseTransaction,
  scope: TenantScope,
  membershipId: string,
  input: NotificationInput,
) {
  const eventType = requireNotificationEventType(input.eventType);
  const title = input.title.trim().slice(0, 500);
  const body = input.body.trim().slice(0, 5000);
  const link = input.link?.trim() || null;
  if (link && (!link.startsWith("/") || link.startsWith("//"))) {
    throw new Error("Notification links must be internal relative paths.");
  }
  if (!title || !body) {
    throw new Error("Notification title and body are required.");
  }

  const [recipient] = await tx
    .select({
      membershipId: organizationMemberships.id,
      userId: users.id,
      email: users.email,
    })
    .from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .where(
      and(
        eq(organizationMemberships.id, membershipId),
        eq(
          organizationMemberships.organizationId,
          scope.organizationId,
        ),
        eq(organizationMemberships.status, "active"),
        eq(users.status, "active"),
      ),
    )
    .limit(1);

  if (!recipient) return null;

  const preferences = await tx
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(
          notificationPreferences.organizationId,
          scope.organizationId,
        ),
        eq(
          notificationPreferences.organizationMembershipId,
          membershipId,
        ),
        inArray(notificationPreferences.eventType, ["*", eventType]),
      ),
    );

  const preferenceFor = (channel: NotificationChannel) =>
    preferences.find(
      (preference) =>
        preference.eventType === eventType &&
        preference.channel === channel,
    ) ??
    preferences.find(
      (preference) =>
        preference.eventType === "*" &&
        preference.channel === channel,
    );

  const inAppPreference = preferenceFor("in_app");
  const emailPreference = preferenceFor("email");
  const webhookPreference = preferenceFor("webhook");

  const inAppEnabled = inAppPreference?.enabled ?? true;
  const emailEnabled = emailPreference?.enabled ?? false;
  const webhookEnabled = webhookPreference?.enabled ?? false;

  const emailDestination = emailEnabled
    ? validateNotificationDestination(
        "email",
        emailPreference?.destination ?? recipient.email,
      )
    : null;
  const webhookDestination = webhookEnabled
    ? validateNotificationDestination(
        "webhook",
        webhookPreference?.destination,
      )
    : null;

  const externalChannels: Array<{
    channel: "email" | "webhook";
    destination: string;
  }> = [];

  if (emailEnabled && emailDestination) {
    externalChannels.push({
      channel: "email",
      destination: emailDestination,
    });
  }
  if (webhookEnabled && webhookDestination) {
    externalChannels.push({
      channel: "webhook",
      destination: webhookDestination,
    });
  }

  if (!inAppEnabled && externalChannels.length === 0) {
    return null;
  }

  const [notification] = await tx
    .insert(notifications)
    .values({
      organizationId: scope.organizationId,
      organizationMembershipId: membershipId,
      eventType,
      severity: input.severity ?? "info",
      title,
      body,
      link,
      resourceType: input.resourceType?.trim() || null,
      resourceId: input.resourceId?.trim() || null,
      inAppVisible: inAppEnabled,
    })
    .returning();

  for (const external of externalChannels) {
    const [delivery] = await tx
      .insert(notificationDeliveries)
      .values({
        organizationId: scope.organizationId,
        notificationId: notification.id,
        channel: external.channel,
        destination: external.destination,
      })
      .returning();

    await enqueueBackgroundJobInTransaction(tx, scope, {
      jobType: "notification.deliver",
      payload: { deliveryId: delivery.id },
      priority: input.severity === "critical" ? 10 : 50,
      maxAttempts: 5,
      dedupeKey: `notification-delivery:${delivery.id}`,
    });
  }

  await tx.insert(auditEvents).values(
    auditEventValues({
      organizationId: scope.organizationId,
      actorType: "system",
      action: "notification.created",
      resourceType: "notification",
      resourceId: notification.id,
      parentResourceType:
        input.resourceType?.trim() || "organization_membership",
      parentResourceId:
        input.resourceId?.trim() || membershipId,
      newState: {
        eventType,
        severity: notification.severity,
        inAppVisible: notification.inAppVisible,
      },
      metadata: {
        membershipId,
        externalChannels: externalChannels.map(
          ({ channel }) => channel,
        ),
      },
    }),
  );

  return notification;
}

export async function createNotificationForCaseAssigneeInTransaction(
  tx: DatabaseTransaction,
  scope: TenantScope,
  caseId: string,
  input: Omit<NotificationInput, "link" | "resourceType" | "resourceId">,
) {
  const [record] = await tx
    .select({
      caseNumber: cases.caseNumber,
      assignedMembershipId: cases.assignedMembershipId,
    })
    .from(cases)
    .where(
      and(
        eq(cases.id, caseId),
        eq(cases.organizationId, scope.organizationId),
      ),
    )
    .limit(1);

  if (!record?.assignedMembershipId) return null;

  return createNotificationForMembershipInTransaction(
    tx,
    scope,
    record.assignedMembershipId,
    {
      ...input,
      link: `/admin/cases/${caseId}`,
      resourceType: "case",
      resourceId: caseId,
      body: `${input.body} Case ${record.caseNumber}.`,
    },
  );
}

export async function createNotificationForUserInTransaction(
  tx: DatabaseTransaction,
  scope: TenantScope,
  userId: string,
  input: NotificationInput,
) {
  const [membership] = await tx
    .select({ id: organizationMemberships.id })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.userId, userId),
        eq(
          organizationMemberships.organizationId,
          scope.organizationId,
        ),
        eq(organizationMemberships.status, "active"),
      ),
    )
    .limit(1);

  if (!membership) return null;

  return createNotificationForMembershipInTransaction(
    tx,
    scope,
    membership.id,
    input,
  );
}

export async function markNotificationRead(
  db: Database,
  scope: TenantScope,
  membershipId: string,
  notificationId: string,
) {
  const [updated] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.organizationId, scope.organizationId),
        eq(
          notifications.organizationMembershipId,
          membershipId,
        ),
        eq(notifications.inAppVisible, true),
      ),
    )
    .returning();

  return updated ?? null;
}

export async function setNotificationPreference(
  db: Database,
  scope: TenantScope,
  input: {
    membershipId: string;
    eventType: string;
    channel: NotificationChannel;
    enabled: boolean;
    destination?: string | null;
    actorUserId: string;
  },
) {
  const eventType =
    input.eventType === "*"
      ? "*"
      : requireNotificationEventType(input.eventType);
  const channel = parseNotificationChannel(input.channel);
  const destination = validateNotificationDestination(
    channel,
    input.destination,
  );

  if (
    input.enabled &&
    channel === "webhook" &&
    !destination
  ) {
    throw new Error(
      "Enabled webhook notifications require an HTTPS destination.",
    );
  }

  return db.transaction(async (tx) => {
    const [membership] = await tx
      .select({ id: organizationMemberships.id })
      .from(organizationMemberships)
      .where(
        and(
          eq(
            organizationMemberships.id,
            input.membershipId,
          ),
          eq(
            organizationMemberships.organizationId,
            scope.organizationId,
          ),
          eq(organizationMemberships.status, "active"),
        ),
      )
      .limit(1);

    if (!membership) {
      throw new Error("Notification membership is unavailable.");
    }

    const [preference] = await tx
      .insert(notificationPreferences)
      .values({
        organizationId: scope.organizationId,
        organizationMembershipId: input.membershipId,
        eventType,
        channel,
        enabled: input.enabled,
        destination,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          notificationPreferences.organizationMembershipId,
          notificationPreferences.eventType,
          notificationPreferences.channel,
        ],
        set: {
          enabled: input.enabled,
          destination,
          updatedAt: new Date(),
        },
      })
      .returning();

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId: input.actorUserId,
        action: "notification.preference_updated",
        resourceType: "notification_preference",
        resourceId: preference.id,
        parentResourceType: "organization_membership",
        parentResourceId: input.membershipId,
        newState: {
          eventType,
          channel,
          enabled: input.enabled,
          hasCustomDestination: Boolean(destination),
        },
      }),
    );

    return preference;
  });
}

export async function recordNotificationDeliverySuccess(
  db: Database,
  scope: TenantScope,
  input: {
    deliveryId: string;
    provider: string;
    externalMessageId?: string | null;
  },
) {
  const [updated] = await db
    .update(notificationDeliveries)
    .set({
      status: "delivered",
      provider: input.provider.trim(),
      externalMessageId: input.externalMessageId?.trim() || null,
      attempts: sql`${notificationDeliveries.attempts} + 1`,
      lastError: null,
      deliveredAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(notificationDeliveries.id, input.deliveryId),
        eq(
          notificationDeliveries.organizationId,
          scope.organizationId,
        ),
        eq(notificationDeliveries.status, "pending"),
      ),
    )
    .returning();

  if (!updated) {
    throw new Error("Notification delivery is unavailable.");
  }
  return updated;
}

export async function recordNotificationDeliveryFailure(
  db: Database,
  scope: TenantScope,
  input: {
    deliveryId: string;
    provider: string;
    error: unknown;
    final: boolean;
  },
) {
  const message =
    input.error instanceof Error
      ? input.error.message.slice(0, 2000)
      : "Unknown notification delivery failure.";

  const [updated] = await db
    .update(notificationDeliveries)
    .set({
      status: input.final ? "failed" : "pending",
      provider: input.provider.trim(),
      attempts: sql`${notificationDeliveries.attempts} + 1`,
      lastError: message,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(notificationDeliveries.id, input.deliveryId),
        eq(
          notificationDeliveries.organizationId,
          scope.organizationId,
        ),
        eq(notificationDeliveries.status, "pending"),
      ),
    )
    .returning();

  return updated ?? null;
}
