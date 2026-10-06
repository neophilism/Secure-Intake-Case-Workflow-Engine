import { describe, expect, it } from "vitest";
import {
  isPrivateAddress,
  normalizeWebhookEventTypes,
  normalizeWebhookUrl,
} from "./policy";

describe("webhook policy", () => {
  it("rejects private and local destinations", () => {
    expect(() => normalizeWebhookUrl("http://example.com/hook")).toThrow();
    expect(() => normalizeWebhookUrl("https://127.0.0.1/hook")).toThrow();
    expect(() => normalizeWebhookUrl("https://localhost/hook")).toThrow();
  });

  it("accepts public https destinations", () => {
    expect(normalizeWebhookUrl("https://example.com/hook")).toBe(
      "https://example.com/hook",
    );
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });

  it("normalizes event types", () => {
    expect(
      normalizeWebhookEventTypes(["case.created", "case.created", "*"]),
    ).toEqual(["*", "case.created"]);
  });
});
