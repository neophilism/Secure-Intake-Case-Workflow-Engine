import { describe, expect, it } from "vitest";
import { checkDatabaseReadiness } from "./readiness";

describe("database readiness", () => {
  it("fails closed when DATABASE_URL is unavailable", async () => {
    await expect(
      checkDatabaseReadiness(undefined),
    ).resolves.toEqual({
      ready: false,
      status: "unconfigured",
    });
  });
});
