import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 60000,
  globalTimeout: 180000,
  expect: { timeout: 10000 },
  outputDir: resolve("test-results"),
  reporter: [
    ["list"],
    ["json", { outputFile: resolve("test-results/report.json") }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4173/Game/",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
        viewport: { width: 375, height: 812 },
      },
    },
  ],
  webServer: {
    cwd: process.cwd(),
    command:
      "node node_modules/vite/bin/vite.js preview --host=127.0.0.1 --port=4173 --strictPort",
    url: "http://127.0.0.1:4173/Game/",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
