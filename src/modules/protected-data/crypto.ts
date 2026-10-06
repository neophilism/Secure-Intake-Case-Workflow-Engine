import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { env } from "@/lib/env";

export interface ProtectedPayloadContext {
  organizationId: string;
  submissionId: string;
  compartmentKey: string;
}

function encryptionKey() {
  if (!env.PROTECTED_DATA_ENCRYPTION_KEY) {
    throw new Error(
      "PROTECTED_DATA_ENCRYPTION_KEY is required when protected form fields are used.",
    );
  }
  return Buffer.from(env.PROTECTED_DATA_ENCRYPTION_KEY, "hex");
}

function authenticatedContext(context: ProtectedPayloadContext) {
  return Buffer.from(
    `protected-data:v1:${context.organizationId}:${context.submissionId}:${context.compartmentKey}`,
    "utf8",
  );
}

export function encryptProtectedPayload(
  payload: Record<string, unknown>,
  context: ProtectedPayloadContext,
) {
  const plaintext = JSON.stringify(payload);
  if (Buffer.byteLength(plaintext, "utf8") > 256 * 1024) {
    throw new Error("Protected payload exceeds the 256 KiB limit.");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(authenticatedContext(context));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptProtectedPayload(
  value: string,
  context: ProtectedPayloadContext,
): Record<string, unknown> {
  const [version, ivValue, tagValue, ciphertextValue] = value.split(".");
  if (
    version !== "v1" ||
    !ivValue ||
    !tagValue ||
    !ciphertextValue
  ) {
    throw new Error("Protected payload is invalid.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAAD(authenticatedContext(context));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

  const decoded = Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  const payload: unknown = JSON.parse(decoded);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Protected payload must decode to an object.");
  }
  return payload as Record<string, unknown>;
}
