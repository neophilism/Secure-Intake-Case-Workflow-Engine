import { z } from "zod";
import type { BackgroundJobHandler } from "@/modules/jobs/worker";
import {
  deliverQueuedCorrespondence,
  recordOutboundCorrespondenceFailure,
} from "./service";
import type { CommunicationTransport } from "./transport";

const payloadSchema = z.object({
  messageId: z.string().uuid(),
});

export type CommunicationTransportResolver = (input: {
  messageId: string;
}) =>
  | CommunicationTransport
  | null
  | Promise<CommunicationTransport | null>;

export function createCorrespondenceDeliveryJobHandler(
  resolveTransport: CommunicationTransportResolver,
): BackgroundJobHandler {
  return async ({ db, scope, job, finalAttempt }) => {
    const payload = payloadSchema.parse(job.payload);
    const transport = await resolveTransport({
      messageId: payload.messageId,
    });

    if (!transport) {
      const error = new Error(
        "No communication transport is registered for this queued message.",
      );
      if (finalAttempt) {
        await recordOutboundCorrespondenceFailure(db, scope, {
          messageId: payload.messageId,
          provider: "unavailable",
          failureMessage: error.message,
        });
      }
      throw error;
    }

    try {
      await deliverQueuedCorrespondence(
        db,
        scope,
        payload.messageId,
        transport,
        { recordFailure: false },
      );
    } catch (error) {
      if (finalAttempt) {
        await recordOutboundCorrespondenceFailure(db, scope, {
          messageId: payload.messageId,
          provider: transport.provider,
          failureMessage:
            error instanceof Error
              ? error.message
              : "Unknown communication delivery failure.",
        });
      }
      throw error;
    }
  };
}
