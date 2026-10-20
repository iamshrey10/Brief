import { defineConfig, devices } from "@playwright/test";

const port = 3100;

/**
 * Browser tests. Real Google sign in cannot be automated (Google blocks it), so the signed in screens are
 * tested with a sign in that exists only outside production (E2E_AUTH, see lib/e2e-auth.ts) and a fake API
 * (e2e/support/fake-api.mjs). The server gets stand-in secrets: none of these tests ever reaches Google,
 * the real API or a model. The rate limit uses a real Redis.
 */
export default defineConfig({
  testDir: "./e2e",
  // One test at a time: the fake API keeps its documents and the calls it received in one place, so tests
  // running side by side would reset each other's data. The whole suite takes about ten seconds.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // A stand-in for the API, so the signed in screens can be tested without a database or a model.
      command: "node e2e/support/fake-api.mjs",
      url: "http://localhost:3101/health",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: `pnpm dev --port ${port}`,
      url: `http://localhost:${port}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        AUTH_SECRET: "e2e-only-secret-not-used-anywhere-else-0123456789",
        AUTH_GOOGLE_ID: "e2e-google-id",
        AUTH_GOOGLE_SECRET: "e2e-google-secret",
        AUTH_TRUST_HOST: "true",
        SERVICE_JWT_SECRET: "e2e-only-service-secret-0123456789abcdef",
        BACKEND_URL: "http://localhost:3101",
        REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
        // Turns on the sign in that exists only outside production, see lib/e2e-auth.ts
        E2E_AUTH: "true",
      },
    },
  ],
});
