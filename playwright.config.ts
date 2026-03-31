import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    browserName: "chromium",
    baseURL: "http://127.0.0.1:8080",
    channel: "chrome",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "FORCE_COLOR=0 npm run server:start:mock",
      url: "http://127.0.0.1:9001/api/health",
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command: "FORCE_COLOR=0 npm run dev -- --host 127.0.0.1 --port 8080",
      url: "http://127.0.0.1:8080",
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
