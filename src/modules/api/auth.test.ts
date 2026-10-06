import { describe, expect, it } from "vitest";
import {
  hashApiToken,
  normalizeApiPermissions,
} from "./auth";

describe("API client policy", () => {
  it("normalizes delegable scopes", () => {
    expect(
      normalizeApiPermissions(["case:view", "form:view", "case:view"]),
    ).toEqual(["case:view", "form:view"]);
  });

  it("rejects unknown and integration-management scopes", () => {
    expect(() => normalizeApiPermissions(["not:a_scope"])).toThrow();
    expect(() => normalizeApiPermissions(["api:manage"])).toThrow();
    expect(() => normalizeApiPermissions(["webhook:manage"])).toThrow();
  });

  it("hashes credentials without preserving the token", () => {
    const token =
      "sicwe_012345abcdef_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO";
    const hash = hashApiToken(token);
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain("sicwe_");
    expect(hashApiToken(token)).toBe(hash);
  });
});
