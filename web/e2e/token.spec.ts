import { createHmac } from "node:crypto";

import { expect, test } from "@playwright/test";

import { FAKE_API, resetFakeApi, signInAsTestReader } from "./support/session";

// The same secret the website signs with (see playwright.config.ts), so these tokens are real ones or near misses.
const SECRET = "e2e-only-service-secret-0123456789abcdef";

const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

function token({ alg = "HS256", exp = Math.floor(Date.now() / 1000) + 60, secret = SECRET } = {}) {
  const head = base64url({ alg });
  const body = base64url({ sub: "reader@example.invalid", iat: Math.floor(Date.now() / 1000), exp });
  const signature = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${signature}`;
}

const documentsWith = (request: import("@playwright/test").APIRequestContext, bearer?: string) =>
  request.get(`${FAKE_API}/documents`, bearer ? { headers: { Authorization: `Bearer ${bearer}` } } : {});

test("the fake API, like the real one, accepts only a token signed with the shared secret that has not expired", async ({
  request,
}) => {
  expect((await documentsWith(request, token())).status()).toBe(200);
  expect((await documentsWith(request)).status()).toBe(401);
  expect((await documentsWith(request, token({ secret: "some-other-secret-that-is-long-enough-0000" }))).status()).toBe(401);
  expect((await documentsWith(request, token({ exp: Math.floor(Date.now() / 1000) - 5 }))).status()).toBe(401);
  expect((await documentsWith(request, token({ alg: "none" }))).status()).toBe(401);
  expect((await documentsWith(request, "not.a.token")).status()).toBe(401);
});

test("the tokens the website really sends pass that check", async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
  await page.goto("/dashboard/documents");

  await expect(page.getByRole("region", { name: "Your documents" }).getByText("sample-lease.pdf")).toBeVisible();
});
