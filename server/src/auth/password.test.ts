import { describe, expect, it } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  assertPasswordPolicy,
  hashPassword,
  validatePasswordPolicy,
  verifyPassword,
} from "./password";

describe("password auth helpers", () => {
  it("hashes with argon2id and verifies passwords", async () => {
    const password = "docklite-pass-2026";

    const passwordHash = await hashPassword(password);

    expect(passwordHash).toContain("argon2id");
    await expect(verifyPassword(passwordHash, password)).resolves.toBe(true);
    await expect(verifyPassword(passwordHash, "docklite-pass-2025")).resolves.toBe(false);
  });

  it("requires a non-empty password", () => {
    expect(validatePasswordPolicy("   ")).toEqual(
      expect.arrayContaining([
        expect.stringContaining("required"),
      ]),
    );

    expect(() => assertPasswordPolicy("")).toThrow(/required/i);
    expect(() => assertPasswordPolicy("docklite-pass-2026")).not.toThrow();
  });

  it("rejects passwords shorter than the minimum length", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(() => assertPasswordPolicy("a".repeat(MIN_PASSWORD_LENGTH - 1))).toThrow(/at least 8 characters/i);
    expect(() => assertPasswordPolicy("a".repeat(MIN_PASSWORD_LENGTH))).not.toThrow();
  });
});
