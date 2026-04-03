import { defineConfig } from "@playwright/test";

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
      command: "mkdir -p /home/amali/.docklite-playwright && rm -rf /home/amali/.docklite-playwright/auth-config.json && DOCKLITE_AUTH_CONFIG_PATH=/home/amali/.docklite-playwright/auth-config.json DOCKLITE_HOST=127.0.0.1 DOCKLITE_PORT=9101 FORCE_COLOR=0 npm run server:start:mock",
      url: "http://127.0.0.1:9101/api/health",
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command: "VITE_API_BASE_URL=http://127.0.0.1:9101 FORCE_COLOR=0 npm run dev -- --host 127.0.0.1 --port 8180",
      url: "http://127.0.0.1:8180",
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
