export type PublicJson =
  | null
  | boolean
  | number
  | string
  | PublicJson[]
  | { [key: string]: PublicJson };

const forbiddenKeys = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

export function parsePublicData(input: unknown): {
  [key: string]: PublicJson;
} {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    throw new Error(
      "Public representation must be a JSON object.",
    );
  }

  const normalized = normalizeJson(input, 0);
  const encoded = JSON.stringify(normalized);
  if (Buffer.byteLength(encoded, "utf8") > 64 * 1024) {
    throw new Error(
      "Public representation exceeds the 64 KiB limit.",
    );
  }

  return normalized as { [key: string]: PublicJson };
}

function normalizeJson(
  value: unknown,
  depth: number,
): PublicJson {
  if (depth > 8) {
    throw new Error("Public representation is too deeply nested.");
  }

  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    if (
      typeof value === "number" &&
      !Number.isFinite(value)
    ) {
      throw new Error(
        "Public representation contains a non-finite number.",
      );
    }
    return value;
  }

  if (typeof value === "string") {
    if (value.length > 10_000) {
      throw new Error(
        "Public representation contains an oversized string.",
      );
    }
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length > 500) {
      throw new Error(
        "Public representation contains an oversized array.",
      );
    }
    return value.map((item) =>
      normalizeJson(item, depth + 1),
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(
      value as Record<string, unknown>,
    );
    if (entries.length > 200) {
      throw new Error(
        "Public representation contains too many object keys.",
      );
    }

    const output: Record<string, PublicJson> =
      Object.create(null);
    for (const [key, item] of entries) {
      if (
        !key ||
        key.length > 200 ||
        forbiddenKeys.has(key)
      ) {
        throw new Error(
          "Public representation contains an invalid key.",
        );
      }
      output[key] = normalizeJson(item, depth + 1);
    }
    return output;
  }

  throw new Error(
    "Public representation must contain JSON-compatible values only.",
  );
}
