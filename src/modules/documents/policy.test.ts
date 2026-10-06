import { describe, expect, it } from "vitest";
import {
  canViewDocumentVisibility,
  isTrustedDocumentContent,
} from "./policy";

describe("document policy", () => {
  it("requires clean available hashed content for trusted evidence", () => {
    const sha256 = "a".repeat(64);
    expect(
      isTrustedDocumentContent({
        contentStatus: "available",
        malwareScanStatus: "clean",
        sha256,
      }),
    ).toBe(true);

    expect(
      isTrustedDocumentContent({
        contentStatus: "quarantined",
        malwareScanStatus: "clean",
        sha256,
      }),
    ).toBe(false);

    expect(
      isTrustedDocumentContent({
        contentStatus: "available",
        malwareScanStatus: "pending",
        sha256,
      }),
    ).toBe(false);
  });

  it("requires private-document permission for restricted content", () => {
    expect(
      canViewDocumentVisibility(
        "restricted",
        new Set(["document:view"]),
      ),
    ).toBe(false);
    expect(
      canViewDocumentVisibility(
        "restricted",
        new Set(["document:view_private"]),
      ),
    ).toBe(true);
  });
});
