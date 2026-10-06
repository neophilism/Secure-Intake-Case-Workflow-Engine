import { describe, expect, it } from "vitest";
import {
  createConfirmationCode,
  createDraftResumeToken,
  hashDraftResumeToken,
} from "./draft-token";

describe("draft and confirmation tokens", () => {
  it("keeps raw resume tokens out of persistence", () => {
    const token = createDraftResumeToken();
    const hash = hashDraftResumeToken(token);

    expect(token.length).toBeGreaterThan(30);
    expect(hash).not.toContain(token);
    expect(hash).toHaveLength(64);
  });

  it("creates recognizable non-secret confirmation codes", () => {
    const code = createConfirmationCode();
    expect(code).toMatch(/^SCW-[0-9A-F]{16}$/);
  });
});
