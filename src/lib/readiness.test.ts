import { describe, expect, it } from "vitest";
import { checkDatabaseReadiness } from "./readiness";

describe("database readiness", () => {
  it("returns unavailable when the connection factory fails before opening a client", async () => {
    await expect(checkDatabaseReadiness("invalid-url", () => { throw new Error("invalid connection"); }))
      .resolves.toEqual({ ready: false, status: "unavailable" });
  });

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
