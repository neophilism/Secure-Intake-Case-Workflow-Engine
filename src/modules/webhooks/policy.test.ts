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
    expect(isPrivateAddress("100.64.0.1")).toBe(true);
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("::ffff:192.168.1.5")).toBe(true);
    expect(isPrivateAddress("::ffff:c0a8:105")).toBe(true);
    expect(isPrivateAddress("2001:db8::1")).toBe(true);
    expect(isPrivateAddress("2002:7f00:1::1")).toBe(true);
    expect(isPrivateAddress("2001:0:4136:e378:8000:63bf:3fff:fdd2")).toBe(true);
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
  });

  it("normalizes event types", () => {
    expect(
      normalizeWebhookEventTypes(["case.created", "case.created", "*"]),
    ).toEqual(["*", "case.created"]);
  });
});
