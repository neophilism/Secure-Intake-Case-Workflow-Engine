import type {
  NotificationChannel,
  NotificationSeverity,
} from "./policy";

export interface NotificationDeliveryRequest {
  idempotencyKey: string;
  channel: Exclude<NotificationChannel, "in_app">;
  destination: string;
  eventType: string;
  severity: NotificationSeverity;
  title: string;
  body: string;
  link: string | null;
  resourceType: string | null;
  resourceId: string | null;
}

export interface NotificationDeliveryResult {
  externalMessageId: string | null;
}

export interface NotificationTransport {
  readonly provider: string;
  readonly channel: Exclude<NotificationChannel, "in_app">;
  send(
    request: NotificationDeliveryRequest,
  ): Promise<NotificationDeliveryResult>;
}
