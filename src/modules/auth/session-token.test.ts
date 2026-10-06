import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  hashSessionToken,
  sessionTokenHashMatches,
} from "./session-token";

describe("session token", () => {
  it("creates opaque high-entropy tokens and hashes them for persistence", () => {
    const token = createSessionToken();
    const secondToken = createSessionToken();

    expect(token).not.toBe(secondToken);
    expect(token.length).toBeGreaterThan(30);

    const tokenHash = hashSessionToken(token);
    expect(tokenHash).not.toContain(token);
    expect(sessionTokenHashMatches(token, tokenHash)).toBe(true);
    expect(sessionTokenHashMatches(secondToken, tokenHash)).toBe(false);
  });
});
