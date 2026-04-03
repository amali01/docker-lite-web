import { createHmac, timingSafeEqual } from "node:crypto";
import type { AuthConfig } from "./types";

export const AUTH_TOKEN_TTL_SECONDS = 60 * 60 * 12;

interface AuthTokenPayload {
  sub: "docklite-admin";
  username: string;
  authVersion: number;
  iat: number;
  exp: number;
}

export interface VerifiedAuthToken {
  username: string;
  expiresAt: string;
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(unsignedToken: string, secret: string) {
  return createHmac("sha256", secret).update(unsignedToken).digest("base64url");
}

export function createAuthToken(config: AuthConfig, now = new Date()) {
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + AUTH_TOKEN_TTL_SECONDS;
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encodeBase64Url(JSON.stringify({
    sub: "docklite-admin",
    username: config.adminUsername,
    authVersion: config.authVersion,
    iat,
    exp,
  } satisfies AuthTokenPayload));
  const unsignedToken = `${header}.${payload}`;
  const signature = sign(unsignedToken, config.jwtSecret);

  return {
    token: `${unsignedToken}.${signature}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export function verifyAuthToken(token: string, config: AuthConfig, now = new Date()): VerifiedAuthToken | null {
  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [header, payload, signature] = parts;
  const expectedSignature = sign(`${header}.${payload}`, config.jwtSecret);
  const signatureBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const decoded = JSON.parse(decodeBase64Url(payload)) as AuthTokenPayload;

    if (
      decoded.sub !== "docklite-admin" ||
      decoded.username !== config.adminUsername ||
      decoded.authVersion !== config.authVersion
    ) {
      return null;
    }

    if (decoded.exp <= Math.floor(now.getTime() / 1000)) {
      return null;
    }

    return {
      username: decoded.username,
      expiresAt: new Date(decoded.exp * 1000).toISOString(),
    };
  } catch {
    return null;
  }
}
