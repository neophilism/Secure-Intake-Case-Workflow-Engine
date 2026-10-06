import { compare, hash } from "bcryptjs";

const BCRYPT_COST = 12;
export const MINIMUM_PASSWORD_LENGTH = 12;

export function validatePassword(password: string): void {
  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    throw new Error(
      `Password must be at least ${MINIMUM_PASSWORD_LENGTH} characters long.`,
    );
  }
}

export async function hashPassword(password: string): Promise<string> {
  validatePassword(password);
  return hash(password, BCRYPT_COST);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return compare(password, passwordHash);
}

export async function consumePasswordVerificationWork(
  password: string,
): Promise<void> {
  // Hashing performs comparable bcrypt work without requiring a stored
  // credential, reducing account-enumeration timing differences.
  await hash(password || "invalid-password", BCRYPT_COST);
}
