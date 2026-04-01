import { describe, expect, it } from "vitest";
import { assertPasswordPolicy, hashPassword, validatePasswordPolicy, verifyPassword } from "./password";

describe("password auth helpers", () => {
  it("hashes with argon2id and verifies passwords", async () => {
    const password = "docklite-pass-2026";

    const passwordHash = await hashPassword(password);

    expect(passwordHash).toContain("argon2id");
    await expect(verifyPassword(passwordHash, password)).resolves.toBe(true);
    await expect(verifyPassword(passwordHash, "docklite-pass-2025")).resolves.toBe(false);
  });

  it("enforces the minimum password policy", () => {
    expect(validatePasswordPolicy("!!!!!!")).toEqual(
      expect.arrayContaining([
        expect.stringContaining("at least 12"),
        expect.stringContaining("letter"),
        expect.stringContaining("number"),
      ]),
    );

    expect(() => assertPasswordPolicy("letters-only-password")).toThrow(/number/i);
    expect(() => assertPasswordPolicy("123456789012")).toThrow(/letter/i);
    expect(() => assertPasswordPolicy("docklite-pass-2026")).not.toThrow();
  });
});
