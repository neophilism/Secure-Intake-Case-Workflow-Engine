import { describe, expect, it } from "vitest";
import { parsePublicData } from "./public-data";

describe("public representation", () => {
  it("accepts bounded JSON objects", () => {
    expect(
      parsePublicData({
        status: "resolved",
        statistics: { count: 2 },
      }),
    ).toEqual({
      status: "resolved",
      statistics: { count: 2 },
    });
  });

  it("rejects a non-object root", () => {
    expect(() => parsePublicData(["unsafe"])).toThrow(
      /JSON object/,
    );
  });

  it("rejects prototype-sensitive keys", () => {
    const value = Object.create(null) as Record<string, unknown>;
    value.__proto__ = "blocked";
    expect(() => parsePublicData(value)).toThrow(/invalid key/);
  });
});
