import { describe, expect, it } from "vitest";
import {
  hashPassword,
  MAXIMUM_PASSWORD_BYTES,
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
  it("rejects passwords beyond bcrypt's effective input bound", () => {
    expect(() => validatePassword("a".repeat(MAXIMUM_PASSWORD_BYTES + 1))).toThrow();
    expect(() => validatePassword("é".repeat(37))).toThrow();
  });
});
