import { describe, expect, it } from "vitest";
import {
  loginBucketHash,
  loginThrottleKeys,
  normalizeLoginIdentifier,
} from "./throttle";

describe("login throttle identity", () => {
  it("normalizes account identifiers", () => {
    expect(normalizeLoginIdentifier("  Person@Example.GOV ")).toBe(
      "person@example.gov",
    );
  });

  it("does not retain plaintext identifiers in bucket keys", () => {
    const hash = loginBucketHash("account", "person@example.gov");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain("person");
  });

  it("uses separate account and source buckets", () => {
    const keys = loginThrottleKeys(
      "person@example.gov",
      "203.0.113.10",
    );
    expect(keys.all).toHaveLength(2);
    expect(keys.all[0]).not.toBe(keys.all[1]);
    expect(keys.account).toBe(keys.all[0]);
  });
});
