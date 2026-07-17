import { resolve } from "node:path";

export interface DockLiteRuntimeConfig {
  host: string;
  port: number;
  remoteModeEnabled: boolean;
  sameOriginMode: boolean;
  staticDir: string | null;
  // Auth bypass (disable-login) is honored only when the server is bound to a
  // canonical loopback address — never when reachable off-box.
  allowAuthBypass: boolean;
}

function parseBoolean(value: string | undefined) {
  return value === "1" || value === "true";
}

// Fail closed: only exact loopback literals count. A hostname (incl.
// "localhost") or any other address is treated as network-exposed, because
// the disable-login gate must never depend on name resolution.
export function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "::1";
}

export function getRuntimeConfig(): DockLiteRuntimeConfig {
  const remoteModeEnabled = parseBoolean(process.env.DOCKLITE_REMOTE_ENABLED);
  const host = process.env.DOCKLITE_HOST ?? (remoteModeEnabled ? "0.0.0.0" : "127.0.0.1");
  const port = Number(process.env.DOCKLITE_PORT ?? 9001);
  const staticDir = remoteModeEnabled ? resolve(process.cwd(), "dist") : null;

  return {
    host,
    port,
    remoteModeEnabled,
    sameOriginMode: remoteModeEnabled,
    staticDir,
    allowAuthBypass: isLoopbackHost(host),
  };
}
