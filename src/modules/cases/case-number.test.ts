import { describe, expect, it } from "vitest";
import { formatCaseNumber } from "./case-number";

describe("case number formatting", () => {
  it("creates stable human-readable year sequences", () => {
    expect(formatCaseNumber(2026, 1)).toBe("2026-000001");
    expect(formatCaseNumber(2026, 418)).toBe("2026-000418");
  });

  it("rejects invalid sequence inputs", () => {
    expect(() => formatCaseNumber(2026, 0)).toThrow(/positive integer/);
    expect(() => formatCaseNumber(26, 1)).toThrow(/four-digit year/);
  });
});
