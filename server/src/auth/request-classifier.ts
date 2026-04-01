import { isIP } from "node:net";
import type { AuthRequestClassification, BrowserOriginTrust, ClassifyRequestInput } from "./types";

function normalizeAddress(address: string): string {
  const trimmed = address.trim();
  const withoutBrackets = trimmed.startsWith("[") && trimmed.endsWith("]") ? trimmed.slice(1, -1) : trimmed;
  const withoutZone = withoutBrackets.includes("%")
    ? withoutBrackets.slice(0, withoutBrackets.indexOf("%"))
    : withoutBrackets;

  if (withoutZone.startsWith("::ffff:")) {
    return withoutZone.slice(7);
  }

  return withoutZone;
}

function getHeader(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | undefined {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function getBrowserOriginTrust(input: ClassifyRequestInput): BrowserOriginTrust {
  const origin = getHeader(input.headers, "origin");

  if (!origin) {
    return "absent";
  }

  const host = getHeader(input.headers, "host");

  if (!host) {
    return "untrusted";
  }

  try {
    const url = new URL(origin);

    if (!isLoopbackAddress(url.hostname)) {
      return "untrusted";
    }

    if (url.protocol !== `${input.protocol}:`) {
      return "untrusted";
    }

    return url.host.toLowerCase() === host.toLowerCase() ? "trusted" : "untrusted";
  } catch {
    return "untrusted";
  }
}

export function isLoopbackAddress(address: string | null | undefined): boolean {
  if (!address) {
    return false;
  }

  const normalized = normalizeAddress(address);

  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") {
    return true;
  }

  return isIP(normalized) === 4 && normalized.startsWith("127.");
}

export function classifyRequest(input: ClassifyRequestInput): AuthRequestClassification {
  const loopback = isLoopbackAddress(input.remoteAddress);
  const browserOrigin = getBrowserOriginTrust(input);

  if (!loopback) {
    return {
      access: "remote",
      channel: input.channel,
      isLoopback: false,
      browserOrigin,
      reason: "Socket remote address is not loopback",
    };
  }

  if (browserOrigin === "untrusted") {
    return {
      access: "remote",
      channel: input.channel,
      isLoopback: true,
      browserOrigin,
      reason: "Loopback request has an untrusted browser origin",
    };
  }

  return {
    access: "local",
    channel: input.channel,
    isLoopback: true,
    browserOrigin,
    reason: browserOrigin === "trusted" ? "Loopback request matched the browser origin" : "Loopback request without browser origin",
  };
}
