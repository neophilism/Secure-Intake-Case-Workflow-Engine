import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export function createExternalParticipantSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function hashExternalParticipantSecret(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function externalParticipantSecretMatches(
  value: string,
  expectedHash: string,
): boolean {
  const actual = Buffer.from(
    hashExternalParticipantSecret(value),
    "hex",
  );
  const expected = Buffer.from(expectedHash, "hex");

  return (
    actual.length === expected.length &&
    timingSafeEqual(actual, expected)
  );
}

export function createExternalParticipantSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashExternalParticipantSessionToken(
  value: string,
): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
