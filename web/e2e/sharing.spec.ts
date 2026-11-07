import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { resetFakeApi, seedSharedDashboard, signInAsTestReader } from "./support/session";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
});

const SHARED = {
  id: "shared-1",
  owner_email: "mum@example.com",
  status: "active",
  dashboard: {
    owner_email: "mum@example.com",
    documents: [
      { id: "m1", filename: "mums-lease.pdf", doc_type: "lease", status: "ready", ocr_confidence: null, created_at: "2026-10-01T12:00:00Z", status_changed_at: "2026-10-01T12:01:00Z", key_terms: [{ label: "Monthly rent", value: "$1,800 a month" }, { label: "Security deposit", value: "One month's rent" }] },
      { id: "m2", filename: "mums-loan.pdf", doc_type: "loan", status: "failed", ocr_confidence: null, created_at: "2026-10-02T12:00:00Z", status_changed_at: "2026-10-02T12:01:00Z", key_terms: [] },
    ],
    insights: [{ document_id: "m1", terms_found: 5, terms_total: 6, questions_answered: 4, open_count: 1, open_questions: ["Is the deposit returned within 30 days?"] }],
    key_dates: [{ document_id: "m1", field: "lease_end", label: "Lease ends", value: "December 31, 2099" }],
  },
};

test("the Dashboard has a Share button that goes to the sharing section", async ({ page }) => {
  await page.goto("/dashboard");

  await page.getByRole("link", { name: "Share dashboard" }).click();

  await expect(page).toHaveURL(/\/dashboard\/shared#sharing$/);
  await expect(page.getByRole("heading", { name: "Share your dashboard", level: 2 })).toBeVisible();
});

test("an invitation is made, used with the code, approved, and then removed", async ({ page }) => {
  await page.goto("/dashboard/shared#sharing");
  await page.getByLabel(/Who is it for/).fill("Mum");
  await page.getByRole("button", { name: "Create invitation" }).click();

  const fresh = page.getByRole("region", { name: "New invitation" });
  await expect(fresh.getByLabel("Invitation code")).toHaveText("482913");
  const link = await fresh.getByLabel("Invitation link").inputValue();
  expect(link).toMatch(/\/shared\/join\/E2Ex{40}$/);

  // The friend opens the link and enters a wrong code, then the right one.
  await page.goto(new URL(link).pathname);
  await page.getByLabel("Six digit code").fill("111111");
  await page.getByRole("button", { name: "Ask for access" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("isn't right");
  await page.getByLabel("Six digit code").fill("482913");
  await page.getByRole("button", { name: "Ask for access" }).click();
  await expect(page.getByRole("status")).toContainText("Your request was sent to");

  // The owner sees who asked and approves.
  await page.goto("/dashboard/shared#sharing");
  const row = page.getByRole("list", { name: "People with access" }).getByRole("listitem");
  await expect(row).toContainText("friend@example.com");
  await expect(row).toContainText("Waiting for your approval");
  await page.getByRole("button", { name: "Approve friend@example.com" }).click();
  await expect(row).toContainText("Can view");

  await page.reload();
  await expect(row).toContainText("Can view");
  await page.getByRole("button", { name: "Remove access for friend@example.com" }).click();
  await expect(page.getByRole("list", { name: "People with access" })).toHaveCount(0);
});

test("an invitation link that is not valid says so", async ({ page }) => {
  await page.goto(`/shared/join/${"z".repeat(43)}`);
  await page.getByLabel("Six digit code").fill("482913");
  await page.getByRole("button", { name: "Ask for access" }).click();

  await expect(page.locator("p[role=alert]")).toContainText("isn't valid any more");
});

test("only five people can be invited at once", async ({ page }) => {
  await page.goto("/dashboard/shared#sharing");
  for (let i = 0; i < 5; i += 1) {
    await page.getByRole("button", { name: "Create invitation" }).click();
    await expect(page.getByText(`${i + 1} of 5 places used`)).toBeVisible();
  }

  await expect(page.getByRole("button", { name: "Create invitation" })).toBeDisabled();
  await expect(page.getByText(/All 5 places are used/)).toBeVisible();
});

test("a dashboard shared with the reader is listed on the Dashboard and can be looked at, read only", async ({ page }) => {
  await seedSharedDashboard(page, SHARED);
  await page.goto("/dashboard");

  await expect(page.getByRole("region", { name: "Shared with you" })).toContainText("mum@example.com");
  await page.getByRole("link", { name: "View dashboard" }).click();

  await expect(page.getByRole("note")).toContainText("mum@example.com");
  await expect(page.getByRole("region", { name: "Lease remaining" })).toContainText("days left");
  await expect(page.getByRole("list", { name: "Shared documents" })).toContainText("mums-lease.pdf");
  await expect(page.getByText("Is the deposit returned within 30 days?")).toBeAttached();
  await expect(page.getByRole("region", { name: "What is here" })).toContainText("Education loan");
  await expect(page.getByRole("region", { name: "Important dates" })).toContainText("December 31, 2099");
  await expect(page.getByRole("region", { name: "Needs attention" })).toContainText("mums-loan.pdf");
  await expect(page.getByRole("list", { name: "Shared documents" }).getByText("Monthly rent")).toBeVisible();
  await expect(page.getByRole("button", { name: /delete|restore|approve|remove|upload|add documents|ask|edit|cancel/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /mums-lease/ })).toHaveCount(0);
});

test("a dashboard that was not shared is not found", async ({ page }) => {
  const response = await page.goto("/dashboard/shared/nope");

  expect(response?.status()).toBe(404);
});

for (const scheme of ["light", "dark"] as const) {
  test(`the sharing pages have no accessibility violations in ${scheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await seedSharedDashboard(page, SHARED);
    for (const path of ["/dashboard/shared", "/dashboard/shared/shared-1", `/shared/join/${"z".repeat(43)}`]) {
      await page.goto(path);
      await page.waitForTimeout(800);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations, path).toEqual([]);
    }
  });
}

test("the Shared section is in the top bar, and a link with its code can be typed in there", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("navigation", { name: "Sections" }).first().getByRole("link", { name: "Shared" }).click();

  await expect(page).toHaveURL(/\/dashboard\/shared$/);
  await expect(page.getByLabel("Share link")).toBeHidden(); // closed until it is asked for
  await page.getByText("Got a share link and code? Enter them here").click();
  await page.getByLabel("Share link").fill(`http://localhost:3000/shared/join/${"z".repeat(43)}`);
  await page.getByLabel("Six digit code").fill("482913");
  await page.getByRole("button", { name: "Ask for access" }).click();

  await expect(page.locator("p[role=alert]")).toContainText("isn't valid any more");
});

test("when the owner has taken access away, the person is told so plainly, stays signed in, and can go back", async ({ page }) => {
  await seedSharedDashboard(page, { id: "gone-1", owner_email: "mum@example.com", owner_name: "Asha Rao", status: "removed" });

  await page.goto("/dashboard/shared/gone-1");

  await expect(page.getByRole("heading", { name: "Your access was removed" })).toBeVisible();
  await expect(page.getByText(/Asha Rao/)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Sections" }).first()).toBeVisible(); // still signed in
  await expect(page.getByText("mums-lease.pdf")).toHaveCount(0);

  await page.getByRole("link", { name: "Back to Shared" }).click();
  await expect(page).toHaveURL(/\/dashboard\/shared$/);
  await expect(page.getByText(/Nothing has been shared with you yet/)).toBeVisible();
});

test("a share that never existed is still simply not found", async ({ page }) => {
  const response = await page.goto("/dashboard/shared/never-was");

  expect(response?.status()).toBe(404);
});
