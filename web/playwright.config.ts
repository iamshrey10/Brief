import { defineConfig, devices } from "@playwright/test";

const port = 3100;

/**
 * Browser tests for what anyone can do without signing in. Real Google sign in cannot be automated
 * (Google blocks it), so everything behind the sign in is covered by the component tests instead.
 * The server gets stand-in secrets: none of these tests ever reaches Google or the API.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
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
    },
  },
});
