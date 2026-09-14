import { resolve } from "node:path";
import { BackendError } from "../types";

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

// A bind reachable off-box, plus the built-in admin/admin password, plus the
// Docker socket, is remote root on the host. Refuse to serve at all rather than
// degrade quietly: in a compose deployment nobody reads a warning, but everyone
// notices a container that will not come up.
export function assertBindIsServable(host: string, defaultCredentialsActive: boolean): void {
  if (!defaultCredentialsActive || isLoopbackHost(host)) {
    return;
  }

  throw new BackendError(
    500,
    "default_credentials_off_loopback",
    `DockLite refuses to listen on ${host} while the built-in admin password is still active — ` +
      `that would expose the Docker socket to anyone who can reach this port. ` +
      `Set DOCKLITE_ADMIN_PASSWORD to a real password and delete server/data/auth-config.json so it re-seeds, ` +
      `or set DOCKLITE_HOST=127.0.0.1 and change the password under Settings first.`,
  );
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
