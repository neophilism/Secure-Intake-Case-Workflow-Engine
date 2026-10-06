import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  notificationDeliveries,
  notifications,
} from "@/db/schema";
import type { BackgroundJobHandler } from "@/modules/jobs/worker";
import {
  recordNotificationDeliveryFailure,
  recordNotificationDeliverySuccess,
} from "./service";
import type { NotificationTransport } from "./transport";

const payloadSchema = z.object({
  deliveryId: z.string().uuid(),
});

export type NotificationTransportResolver = (
  channel: "email" | "webhook",
) => NotificationTransport | null | Promise<NotificationTransport | null>;

export function createNotificationDeliveryJobHandler(
  resolveTransport: NotificationTransportResolver,
): BackgroundJobHandler {
  return async ({ db, scope, job, finalAttempt }) => {
    const payload = payloadSchema.parse(job.payload);

    const [delivery] = await db
      .select({
        delivery: notificationDeliveries,
        notification: notifications,
      })
      .from(notificationDeliveries)
      .innerJoin(
        notifications,
        and(
          eq(
            notifications.id,
            notificationDeliveries.notificationId,
          ),
          eq(
            notifications.organizationId,
            notificationDeliveries.organizationId,
          ),
        ),
      )
      .where(
        and(
          eq(notificationDeliveries.id, payload.deliveryId),
          eq(
            notificationDeliveries.organizationId,
            scope.organizationId,
          ),
        ),
      )
      .limit(1);

    if (!delivery) {
      throw new Error("Notification delivery was not found.");
    }
    if (delivery.delivery.status === "delivered") return;
    if (
      delivery.delivery.channel !== "email" &&
      delivery.delivery.channel !== "webhook"
    ) {
      throw new Error("Notification delivery channel is unsupported.");
    }

    const transport = await resolveTransport(
      delivery.delivery.channel,
    );
    if (!transport) {
      const error = new Error(
        `No notification transport is registered for ${delivery.delivery.channel}.`,
      );
      await recordNotificationDeliveryFailure(db, scope, {
        deliveryId: delivery.delivery.id,
        provider: "unavailable",
        error,
        final: finalAttempt,
      });
      throw error;
    }
    if (transport.channel !== delivery.delivery.channel) {
      throw new Error("Resolved notification transport channel mismatch.");
    }

    try {
      const result = await transport.send({
        idempotencyKey: delivery.delivery.id,
        channel: delivery.delivery.channel,
        destination: delivery.delivery.destination,
        eventType: delivery.notification.eventType,
        severity: delivery.notification.severity as
          | "info"
          | "warning"
          | "critical",
        title: delivery.notification.title,
        body: delivery.notification.body,
        link: delivery.notification.link,
        resourceType: delivery.notification.resourceType,
        resourceId: delivery.notification.resourceId,
      });

      await recordNotificationDeliverySuccess(db, scope, {
        deliveryId: delivery.delivery.id,
        provider: transport.provider,
        externalMessageId: result.externalMessageId,
      });
    } catch (error) {
      await recordNotificationDeliveryFailure(db, scope, {
        deliveryId: delivery.delivery.id,
        provider: transport.provider,
        error,
        final: finalAttempt,
      });
      throw error;
    }
  };
}
