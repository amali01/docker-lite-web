import { defineConfig } from "@playwright/test";
import os from "node:os";
import path from "node:path";

// Throwaway auth-config location for the e2e mock server. Resolved from the OS
// temp dir at load time so it works on any machine/CI without a hardcoded path.
const authConfigPath = path.join(os.tmpdir(), "docklite-playwright", "auth-config.json");

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  use: {
    browserName: "chromium",
    baseURL: "http://127.0.0.1:8180",
    channel: "chrome",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `mkdir -p "${path.dirname(authConfigPath)}" && rm -rf "${authConfigPath}" && DOCKLITE_AUTH_CONFIG_PATH="${authConfigPath}" DOCKLITE_HOST=127.0.0.1 DOCKLITE_PORT=9101 FORCE_COLOR=0 pnpm server:start:mock`,
      url: "http://127.0.0.1:9101/api/health",
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command: "VITE_API_BASE_URL=http://127.0.0.1:9101 FORCE_COLOR=0 pnpm dev --host 127.0.0.1 --port 8180",
      url: "http://127.0.0.1:8180",
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
