import { describe, expect, it } from "vitest";
import { checkDatabaseReadiness } from "./readiness";

describe("database readiness", () => {
  it("fails closed when DATABASE_URL is unavailable", async () => {
    const original = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    try {
      await expect(
        checkDatabaseReadiness(),
      ).resolves.toEqual({
        ready: false,
        status: "unconfigured",
      });
    } finally {
      if (original === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = original;
      }
    }
  });
});
