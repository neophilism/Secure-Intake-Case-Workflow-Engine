import { z } from "zod";
import {
  canExposeToAudience,
  parseInformationClass,
  type InformationClass,
} from "@/modules/disclosures/policy";

export const communicationVisibilities = [
  "internal",
  "participant",
  "public",
] as const;

export type CommunicationVisibility =
  | "internal"
  | "participant"
  | "public";

export const communicationChannels = [
  "email",
  "letter",
  "portal",
  "manual",
] as const;

export type CommunicationChannel =
  (typeof communicationChannels)[number];

export const correspondenceDirections = [
  "outbound",
  "inbound",
] as const;

export type CorrespondenceDirection =
  (typeof correspondenceDirections)[number];

export const correspondenceStatuses = [
  "draft",
  "queued",
  "sent",
  "failed",
  "received",
] as const;

export type CorrespondenceStatus =
  (typeof correspondenceStatuses)[number];

export interface CommunicationRecipient {
  type: "to" | "cc" | "bcc";
  address: string;
  name?: string;
}

const emailSchema = z.string().trim().email().max(320);

export function parseCommunicationVisibility(
  value: string,
): CommunicationVisibility {
  const normalized = parseInformationClass(value);
  if (
    normalized !== "internal" &&
    normalized !== "participant" &&
    normalized !== "public"
  ) {
    throw new Error(
      "Restricted classification is not valid for participant-facing correspondence.",
    );
  }
  return normalized;
}

export function parseCommunicationChannel(
  value: string,
): CommunicationChannel {
  if (!(communicationChannels as readonly string[]).includes(value)) {
    throw new Error("Communication channel is invalid.");
  }
  return value as CommunicationChannel;
}

export function parseRecipientText(
  channel: CommunicationChannel,
  input: {
    to?: string | null;
    cc?: string | null;
    bcc?: string | null;
  },
): CommunicationRecipient[] {
  const recipients: CommunicationRecipient[] = [];

  for (const [type, raw] of [
    ["to", input.to],
    ["cc", input.cc],
    ["bcc", input.bcc],
  ] as const) {
    for (const address of (raw ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)) {
      recipients.push({
        type,
        address: normalizeRecipientAddress(channel, address),
      });
    }
  }

  return recipients;
}

export function normalizeRecipients(
  channel: CommunicationChannel,
  recipients: readonly CommunicationRecipient[],
): CommunicationRecipient[] {
  return recipients.map((recipient) => ({
    type: recipient.type,
    address: normalizeRecipientAddress(
      channel,
      recipient.address,
    ),
    ...(recipient.name?.trim()
      ? { name: recipient.name.trim().slice(0, 300) }
      : {}),
  }));
}

export function requireOutboundRecipients(
  recipients: readonly CommunicationRecipient[],
) {
  if (!recipients.some((recipient) => recipient.type === "to")) {
    throw new Error(
      "Outbound correspondence requires at least one primary recipient.",
    );
  }
}

export function canExposeDocumentInCommunication(
  visibility: CommunicationVisibility,
  documentVisibility: string,
): boolean {
  return canExposeToAudience(
    documentVisibility,
    visibility as Exclude<
      InformationClass,
      "restricted"
    >,
  );
}

function normalizeRecipientAddress(
  channel: CommunicationChannel,
  address: string,
): string {
  const normalized = address.trim();
  if (!normalized || normalized.length > 500) {
    throw new Error("Communication recipient is invalid.");
  }

  if (channel === "email") {
    return emailSchema.parse(normalized).toLowerCase();
  }

  return normalized;
}
