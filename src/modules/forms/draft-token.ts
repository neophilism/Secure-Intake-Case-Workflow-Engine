import { createHash, randomBytes } from "node:crypto";

export function createDraftResumeToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashDraftResumeToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createConfirmationCode(): string {
  return `SCW-${randomBytes(8).toString("hex").toUpperCase()}`;
}
