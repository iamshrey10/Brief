import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { resetFakeApi, seedTwoFactor, signInAsTestReader, totp, TWO_FACTOR_SECRET } from "./support/session";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
});

async function turnOn(page: Page) {
  await page.goto("/dashboard/profile#two-step");
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByAltText("QR code for your authenticator app")).toBeVisible();
  const text = await page.locator("li", { hasText: "type this key in by hand" }).textContent();
  const secret = (text ?? "").replace(/.*by hand:/, "").replace(/\s/g, "").replace(/Enterthe.*/, "");
  await page.getByLabel("6 digit code").fill(totp(secret));
  await page.getByRole("button", { name: "Turn on" }).click();
  return secret;
}

test("two step verification is turned on with a QR code and a first code, and shows ten recovery codes once", async ({ page }) => {
  await page.goto("/dashboard/profile#two-step");
  await expect(page.getByRole("region", { name: "Two step verification" })).toContainText("Status: off");

  await turnOn(page);

  await expect(page.getByRole("status").filter({ hasText: "Two step verification is on" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Recovery codes" }).getByRole("listitem")).toHaveCount(10);
  await page.getByRole("button", { name: "I have saved them" }).click();
  await expect(page.getByRole("region", { name: "Two step verification" })).toContainText("Status: on · 10 recovery codes left");
  await page.reload();
  await expect(page.getByRole("region", { name: "Two step verification" })).toContainText("Status: on · 10 recovery codes left");
  // Turning it on does not lock the person out of the page they are on.
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
});

test("a wrong first code turns nothing on, and says why", async ({ page }) => {
  await page.goto("/dashboard/profile#two-step");
  await page.getByRole("button", { name: "Turn on" }).click();
  await page.getByLabel("6 digit code").fill("000000");
  await page.getByRole("button", { name: "Turn on" }).click();

  await expect(page.locator("p[role=alert]")).toContainText("isn't right");
  await expect(page.getByAltText("QR code for your authenticator app")).toBeVisible();
});

test("someone with it on is asked for a code on a browser that is not remembered, and a wrong one is refused", async ({ page }) => {
  await seedTwoFactor(page);

  await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/two-factor\/verify\?next=%2Fdashboard$/);
  await expect(page.getByRole("heading", { name: "Verify it is you", level: 1 })).toBeVisible();
  await page.getByLabel("Code from your authenticator app").fill("000000");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("isn't right");
  await expect(page).toHaveURL(/\/two-factor\/verify/);

  await page.getByLabel("Code from your authenticator app").fill(totp(TWO_FACTOR_SECRET));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
});

test("the page asked for is the page reached after the code, and a link cannot send anyone elsewhere", async ({ page }) => {
  await seedTwoFactor(page);

  await page.goto("/dashboard/profile");
  await expect(page).toHaveURL(/next=%2Fdashboard%2Fprofile$/);
  await page.getByLabel("Code from your authenticator app").fill(totp(TWO_FACTOR_SECRET));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/dashboard\/profile$/);

  await page.context().clearCookies({ name: "brief_2fa" });
  await page.goto("/two-factor/check?next=https://evil.example/steal");
  await expect(page).toHaveURL(/\/two-factor\/verify\?next=%2Fdashboard$/);
});

test("a recovery code signs in, once", async ({ page }) => {
  await seedTwoFactor(page);
  await page.goto("/dashboard");

  await page.getByLabel("Code from your authenticator app").fill("rcode0-abcd0");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.context().clearCookies({ name: "brief_2fa" });
  await page.goto("/dashboard");
  await page.getByLabel("Code from your authenticator app").fill("RCODE0-ABCD0");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("isn't right");
});

test("a remembered browser is not asked again, and one that was not remembered is", async ({ page }) => {
  await seedTwoFactor(page);
  await page.goto("/dashboard");
  await page.getByLabel("Code from your authenticator app").fill(totp(TWO_FACTOR_SECRET));
  await page.getByLabel("Remember this browser for 30 days").check();
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.context().clearCookies({ name: "brief_2fa" });
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

  await page.context().clearCookies({ name: "brief_2fa" });
  await page.context().clearCookies({ name: "brief_device" });
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/two-factor\/verify/);
});

test("a cookie that was made up does not settle the check", async ({ page }) => {
  await seedTwoFactor(page);
  await page.context().addCookies([{ name: "brief_2fa", value: "not-a-real-token", url: "http://localhost:3100" }]);

  await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/two-factor\/verify/);
});

test("signing out means the next sign in is asked for a code again", async ({ page }) => {
  await seedTwoFactor(page);
  await page.goto("/dashboard");
  await page.getByLabel("Code from your authenticator app").fill(totp(TWO_FACTOR_SECRET));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/localhost:3100\/$/);
  await signInAsTestReader(page);
  await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/two-factor\/verify/);
});

test("it is turned off with a right code, and the next visit asks for nothing", async ({ page }) => {
  await seedTwoFactor(page);
  await page.goto("/dashboard");
  await page.getByLabel("Code from your authenticator app").fill(totp(TWO_FACTOR_SECRET));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/dashboard/profile#two-step");

  await page.getByRole("button", { name: "Turn off" }).click();
  await page.getByLabel(/Code, or a recovery code/).fill("000000");
  await page.getByRole("button", { name: "Turn off" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("isn't right");
  await page.getByLabel(/Code, or a recovery code/).fill(totp(TWO_FACTOR_SECRET));
  await page.getByRole("button", { name: "Turn off" }).click();

  await expect(page.getByRole("region", { name: "Two step verification" })).toContainText("Status: off");
  await page.context().clearCookies({ name: "brief_2fa" });
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("five wrong codes are answered as locked", async ({ page }) => {
  await seedTwoFactor(page);
  await page.goto("/dashboard");
  for (let i = 0; i < 5; i += 1) {
    await page.getByLabel("Code from your authenticator app").fill("000000");
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.locator("p[role=alert]")).toBeVisible();
  }

  await page.getByLabel("Code from your authenticator app").fill(totp(TWO_FACTOR_SECRET));
  await page.getByRole("button", { name: "Verify" }).click();

  await expect(page.locator("p[role=alert]")).toContainText("Wait 15 minutes");
  await expect(page).toHaveURL(/\/two-factor\/verify/);
});

for (const scheme of ["light", "dark"] as const) {
  test(`the code page and the setup have no accessibility violations in ${scheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/dashboard/profile#two-step");
    await page.getByRole("button", { name: "Turn on" }).click();
    await expect(page.getByAltText("QR code for your authenticator app")).toBeVisible();
    await page.waitForTimeout(600);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await seedTwoFactor(page);
    await page.context().clearCookies({ name: "brief_2fa" });
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Verify it is you" })).toBeVisible();
    await page.waitForTimeout(600);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
