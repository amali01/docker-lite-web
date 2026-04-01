import { argon2id, hash as argon2Hash, verify as argon2Verify } from "argon2";
import { BackendError } from "../types";

export const MIN_PASSWORD_LENGTH = 12;

export function validatePasswordPolicy(password: string): string[] {
  const issues: string[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    issues.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
  }

  if (!/[A-Za-z]/.test(password)) {
    issues.push("Password must include at least one letter");
  }

  if (!/\d/.test(password)) {
    issues.push("Password must include at least one number");
  }

  return issues;
}

export function assertPasswordPolicy(password: string): void {
  const issues = validatePasswordPolicy(password);

  if (issues.length > 0) {
    throw new BackendError(400, "validation_error", issues.join(". "));
  }
}

export async function hashPassword(password: string): Promise<string> {
  assertPasswordPolicy(password);

  return argon2Hash(password, {
    type: argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await argon2Verify(passwordHash, password);
  } catch {
    return false;
  }
}
