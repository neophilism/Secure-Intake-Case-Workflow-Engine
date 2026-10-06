import { describe, expect, it } from "vitest";
import { webhookSignature } from "./crypto";

describe("webhook signatures", () => {
  it("signs timestamp and exact body deterministically", () => {
    const signature = webhookSignature(
      "01234567890123456789012345678901",
      "1730000000",
      '{"type":"case.created"}',
    );
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
    expect(
      webhookSignature(
        "01234567890123456789012345678901",
        "1730000000",
        '{"type":"case.created"}',
      ),
    ).toBe(signature);
    expect(
      webhookSignature(
        "01234567890123456789012345678901",
        "1730000001",
        '{"type":"case.created"}',
      ),
    ).not.toBe(signature);
  });
});
