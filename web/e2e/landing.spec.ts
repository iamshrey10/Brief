import { expect, test } from "@playwright/test";

test("the landing page says what Brief is and offers to sign in", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Every clause, explained.");
  await expect(page.getByText("Every clause, explained.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();

  await expect(page).toHaveTitle("Brief: Every clause, explained.");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /exact words behind every answer/);
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute("content", "Brief");
});

test("the top bar stays in view after scrolling to the bottom", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.getByRole("link", { name: "Brief." }).first()).toBeInViewport();
});

test("a shared link shows Brief's own card image and the page has Brief's own icon", async ({ page, request }) => {
  await page.goto("/");

  const image = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(image).toBeTruthy();
  const card = await request.get(image!);
  expect(card.status()).toBe(200);
  expect(card.headers()["content-type"]).toContain("image/png");
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute("content", "1200");
  await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute("content", "Brief: Every clause, explained.");

  const icon = await page.locator('link[rel="icon"][type="image/svg+xml"]').getAttribute("href");
  expect((await request.get(icon!)).status()).toBe(200);
});

for (const [name, width, height] of [["a laptop", 1440, 900], ["a wide monitor", 1920, 1080], ["a small laptop", 1280, 720], ["a tablet", 820, 1180], ["a phone", 390, 844]] as const)
  test(`on ${name} the landing page is one screen: the headline and the way in are in view, and nothing runs off the side`, async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" })).newPage();
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeInViewport();
    await expect(page.getByRole("heading", { name: "What you get" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "How it works" })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
