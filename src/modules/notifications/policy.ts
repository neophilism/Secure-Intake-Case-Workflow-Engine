import { z } from "zod";

export const notificationChannels = [
  "in_app",
  "email",
  "webhook",
] as const;

export type NotificationChannel =
  (typeof notificationChannels)[number];

export const notificationSeverities = [
  "info",
  "warning",
  "critical",
] as const;

export type NotificationSeverity =
  (typeof notificationSeverities)[number];

const eventTypePattern = /^[a-z][a-z0-9_.:-]*$/;

export function requireNotificationEventType(
  eventType: string,
): string {
  const normalized = eventType.trim();
  if (
    !eventTypePattern.test(normalized) ||
    normalized.length > 200
  ) {
    throw new Error("Notification event type is invalid.");
  }
  return normalized;
}

export function parseNotificationChannel(
  value: string,
): NotificationChannel {
  if (
    !(notificationChannels as readonly string[]).includes(value)
  ) {
    throw new Error("Notification channel is invalid.");
  }
  return value as NotificationChannel;
}

export function validateNotificationDestination(
  channel: NotificationChannel,
  destination: string | null | undefined,
): string | null {
  const normalized = destination?.trim() || null;
  if (channel === "in_app") return null;
  if (!normalized) return null;

  if (channel === "email") {
    return z.string().email().max(320).parse(normalized).toLowerCase();
  }

  const url = new URL(normalized);
  if (url.protocol !== "https:") {
    throw new Error("Webhook destinations must use HTTPS.");
  }
  return url.toString();
}
