import { describe, expect, it } from "vitest";
import {
  casePriorities,
  isCasePriority,
} from "./lifecycle";

describe("case priority", () => {
  it("keeps a small stable priority vocabulary independent of workflow states", () => {
    expect(casePriorities).toEqual([
      "low",
      "normal",
      "high",
      "critical",
    ]);
  });

  it("validates priority values at runtime", () => {
    expect(isCasePriority("critical")).toBe(true);
    expect(isCasePriority("intake_review")).toBe(false);
  });
});
