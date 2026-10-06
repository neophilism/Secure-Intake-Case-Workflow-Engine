import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import { env } from "@/lib/env";

function encryptionKey() {
  if (!env.WEBHOOK_ENCRYPTION_KEY) {
    throw new Error(
      "WEBHOOK_ENCRYPTION_KEY is required for webhook subscriptions.",
    );
  }
  return Buffer.from(env.WEBHOOK_ENCRYPTION_KEY, "hex");
}

export function encryptWebhookSecret(secret: string) {
  if (secret.length < 32 || secret.length > 256) {
    throw new Error("Webhook signing secret must be 32-256 characters.");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
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

export function decryptWebhookSecret(value: string) {
  const [version, ivValue, tagValue, ciphertextValue] = value.split(".");
  if (
    version !== "v1" ||
    !ivValue ||
    !tagValue ||
    !ciphertextValue
  ) {
    throw new Error("Webhook signing secret is invalid.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function webhookSignature(
  secret: string,
  timestamp: string,
  body: string,
) {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${body}`, "utf8")
    .digest("hex");
}
