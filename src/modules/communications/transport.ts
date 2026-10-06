import type {
  CommunicationChannel,
  CommunicationRecipient,
} from "./policy";

export interface CommunicationDeliveryAttachment {
  documentVersionId: string;
  filename: string;
  mimeType: string;
  sha256: string;
}

export interface CommunicationDeliveryRequest {
  idempotencyKey: string;
  channel: CommunicationChannel;
  senderAddress: string | null;
  recipients: CommunicationRecipient[];
  subject: string | null;
  body: string;
  attachments: CommunicationDeliveryAttachment[];
}

export interface CommunicationDeliveryResult {
  externalMessageId: string | null;
  metadata?: Record<string, unknown>;
}

export interface CommunicationTransport {
  readonly provider: string;
  readonly supportedChannels: readonly CommunicationChannel[];
  send(
    request: CommunicationDeliveryRequest,
  ): Promise<CommunicationDeliveryResult>;
}

export function assertTransportSupportsChannel(
  transport: CommunicationTransport,
  channel: CommunicationChannel,
) {
  if (!transport.supportedChannels.includes(channel)) {
    throw new Error(
      `Transport ${transport.provider} does not support channel ${channel}.`,
    );
  }
}
