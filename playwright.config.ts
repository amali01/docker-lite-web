import { defineConfig } from "@playwright/test";
import os from "node:os";
import path from "node:path";

// Throwaway auth-config location for the e2e mock server. Resolved from the OS
// temp dir at load time so it works on any machine/CI without a hardcoded path.
// It is seeded by tests/e2e/seed-auth-config.ts rather than left for the server
// to create: a self-seeded config disables login on a loopback bind, which
// redirects /login away and makes every spec unable to sign in.
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
      command: `rm -rf "${authConfigPath}" && DOCKLITE_AUTH_CONFIG_PATH="${authConfigPath}" pnpm exec tsx tests/e2e/seed-auth-config.ts && DOCKLITE_AUTH_CONFIG_PATH="${authConfigPath}" DOCKLITE_HOST=127.0.0.1 DOCKLITE_PORT=9101 FORCE_COLOR=0 pnpm server:start:mock`,
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
