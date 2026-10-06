import { describe, expect, it } from "vitest";
import {
  hashPassword,
  MINIMUM_PASSWORD_LENGTH,
  validatePassword,
  verifyPassword,
} from "./password";

describe("password credentials", () => {
  it("hashes and verifies a valid password", async () => {
    const password = "correct horse battery staple";
    const passwordHash = await hashPassword(password);

    expect(passwordHash).not.toBe(password);
    expect(await verifyPassword(password, passwordHash)).toBe(true);
    expect(await verifyPassword("wrong password", passwordHash)).toBe(false);
  });

  it("rejects short passwords", () => {
    expect(() => validatePassword("x".repeat(MINIMUM_PASSWORD_LENGTH - 1))).toThrow(
      /at least/,
    );
  });
});
