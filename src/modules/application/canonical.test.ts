import { describe, expect, it } from "vitest";
import { canonicalJson, checksumJson } from "./canonical";

describe("canonical application JSON", () => {
  it("sorts object keys recursively but preserves array order", () => {
    expect(
      canonicalJson({
        z: 1,
        a: { y: 2, x: 3 },
        list: [{ b: 2, a: 1 }, "x"],
      }),
    ).toBe(
      '{"a":{"x":3,"y":2},"list":[{"a":1,"b":2},"x"],"z":1}',
    );
  });

  it("produces the same checksum for equivalent objects", () => {
    expect(checksumJson({ b: 2, a: 1 })).toBe(
      checksumJson({ a: 1, b: 2 }),
    );
  });
});
