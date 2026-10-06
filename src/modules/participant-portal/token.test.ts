import { describe, expect, it } from "vitest";
import {
  createExternalParticipantSecret,
  createExternalParticipantSessionToken,
  externalParticipantSecretMatches,
  hashExternalParticipantSecret,
  hashExternalParticipantSessionToken,
} from "./token";

describe("external participant tokens", () => {
  it("stores credential secrets only as hashes", () => {
    const secret = createExternalParticipantSecret();
    const hash = hashExternalParticipantSecret(secret);

    expect(secret.length).toBeGreaterThan(30);
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(secret);
    expect(externalParticipantSecretMatches(secret, hash)).toBe(true);
    expect(
      externalParticipantSecretMatches(
        createExternalParticipantSecret(),
        hash,
      ),
    ).toBe(false);
  });

  it("creates independently hashed session tokens", () => {
    const token = createExternalParticipantSessionToken();
    const hash = hashExternalParticipantSessionToken(token);
    expect(token.length).toBeGreaterThan(30);
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(token);
  });
});
