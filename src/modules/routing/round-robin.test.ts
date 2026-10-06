import { describe, expect, it } from "vitest";
import { roundRobinIndex } from "./round-robin";

describe("round robin selection", () => {
  it("rotates through candidates and wraps", () => {
    expect(roundRobinIndex(1, 3)).toBe(0);
    expect(roundRobinIndex(2, 3)).toBe(1);
    expect(roundRobinIndex(3, 3)).toBe(2);
    expect(roundRobinIndex(4, 3)).toBe(0);
  });

  it("rejects invalid inputs", () => {
    expect(() => roundRobinIndex(0, 3)).toThrow();
    expect(() => roundRobinIndex(1, 0)).toThrow();
  });
});
