import { expect, type Page } from "@playwright/test";

export const FAKE_API = "http://localhost:3101";

/** Signs the page in as the reserved test reader, through the sign in that exists only outside production. */
export async function signInAsTestReader(page: Page): Promise<void> {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  const response = await page.request.post("/api/auth/callback/e2e", {
    form: { csrfToken, callbackUrl: "/dashboard", json: "true" },
  });
  expect(response.ok()).toBe(true);
}

/** Puts the fake API back to its starting data, so one test's delete cannot affect the next. */
export async function resetFakeApi(page: Page): Promise<void> {
  const response = await page.request.post(`${FAKE_API}/__reset`);
  expect(response.status()).toBe(204);
}
