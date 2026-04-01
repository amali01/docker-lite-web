import { randomBytes, timingSafeEqual } from "node:crypto";

export function generateCsrfToken(size = 32): string {
  return randomBytes(size).toString("base64url");
}

export function verifyCsrfToken(expectedToken: string, providedToken: string | null | undefined): boolean {
  if (!expectedToken || !providedToken) {
    return false;
  }

  const expectedBuffer = Buffer.from(expectedToken);
  const providedBuffer = Buffer.from(providedToken);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}
