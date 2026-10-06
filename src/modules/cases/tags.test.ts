import { describe, expect, it } from "vitest";
import { normalizeCaseTag, normalizeCaseTags } from "./tags";

describe("case tags", () => {
  it("normalizes free-form labels to stable tags", () => {
    expect(normalizeCaseTag("  Urgent Review  ")).toBe("urgent-review");
  });

  it("deduplicates and sorts tags", () => {
    expect(
      normalizeCaseTags(["Privacy", "urgent review", "privacy"]),
    ).toEqual(["privacy", "urgent-review"]);
  });
});
