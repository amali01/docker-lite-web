import { resolve } from "node:path";

export interface DockLiteRuntimeConfig {
  host: string;
  port: number;
  remoteModeEnabled: boolean;
  sameOriginMode: boolean;
  staticDir: string | null;
}

function parseBoolean(value: string | undefined) {
  return value === "1" || value === "true";
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
  };
}
