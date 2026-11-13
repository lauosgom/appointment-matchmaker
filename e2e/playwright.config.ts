import { defineConfig, devices } from "@playwright/test";

import { BASE_URL } from "./support/env";

/**
 * End-to-end tests against the stack defined in ../docker-compose.yaml.
 *
 * globalSetup starts a separate Compose project (fresh Postgres + app built
 * from the current tree) and globalTeardown removes it with its volume.
 * See README.md for the knobs (E2E_PORT, E2E_KEEP, E2E_NO_BUILD).
 *
 * The tests share one database and some of them change global settings
 * (appointment length, year letters) or restart containers, so they run
 * one at a time, in file order.
 */
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./support/global-setup.ts",
  globalTeardown: "./support/global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    locale: "es-CO",
    timezoneId: "America/Bogota",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
