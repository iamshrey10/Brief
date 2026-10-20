import { randomUUID } from "node:crypto";

import { expect, type Page } from "@playwright/test";

export const FAKE_API = "http://localhost:3101";

/**
 * Signs the page in as a test reader of its own, through the sign in that exists only outside production.
 * Each call uses a new address on the reserved domain, so every test has its own rate limit counter and
 * one test cannot use up another's allowance.
 */
export async function signInAsTestReader(page: Page): Promise<string> {
  const email = `reader-${randomUUID()}@example.invalid`;
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  const response = await page.request.post("/api/auth/callback/e2e", {
    form: { csrfToken, callbackUrl: "/dashboard", json: "true", email },
  });
  expect(response.ok()).toBe(true);
  return email;
}

/** Puts the fake API back to its starting data, so one test's delete cannot affect the next. */
export async function resetFakeApi(page: Page): Promise<void> {
  const response = await page.request.post(`${FAKE_API}/__reset`);
  expect(response.status()).toBe(204);
}
