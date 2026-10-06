import { describe, expect, it } from "vitest";
import {
  requireNotificationEventType,
  validateNotificationDestination,
} from "./policy";

describe("notification policy", () => {
  it("accepts stable event keys", () => {
    expect(
      requireNotificationEventType("deadline.warning"),
    ).toBe("deadline.warning");
  });

  it("normalizes email destinations", () => {
    expect(
      validateNotificationDestination(
        "email",
        "USER@EXAMPLE.COM",
      ),
    ).toBe("user@example.com");
  });

  it("requires HTTPS webhook destinations", () => {
    expect(() =>
      validateNotificationDestination(
        "webhook",
        "http://example.com/hook",
      ),
    ).toThrow(/HTTPS/);
  });
});
