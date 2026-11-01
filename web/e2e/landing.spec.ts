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

test("the top bar's links take you to their sections, and the page has the attribute Next needs for smooth scrolling", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-scroll-behavior", "smooth");

  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "How it works" }).click();
  await expect(page).toHaveURL(/#how$/);
  await expect(page.getByRole("heading", { level: 2, name: "How it works" })).toBeInViewport();

  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "What you get" }).click();
  await expect(page).toHaveURL(/#features$/);
  await expect(page.getByRole("heading", { level: 2, name: "What you get" })).toBeInViewport();
});

test("the top bar stays in view after scrolling to the bottom, and the section links are hidden on a phone", async ({ page, browser }) => {
  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.getByRole("link", { name: "Brief." }).first()).toBeInViewport();

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phonePage = await phone.newPage();
  await phonePage.goto("/");
  await expect(phonePage.getByRole("navigation", { name: "Sections" })).toBeHidden();
  await phone.close();
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

test("How it works waits for you to reach it, then brings its three cards in one after another, with every word as before", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto("/");
  const section = page.locator("#how [data-reveal]");
  const cards = page.locator("#how .hiw-card");
  const opacity = (index: number) => cards.nth(index).evaluate((el) => getComputedStyle(el).opacity);

  // Below the first screen, the cards are ready and waiting, not yet shown.
  await expect(section).toHaveAttribute("data-reveal", "armed");
  expect(await opacity(0)).toBe("0");

  await page.locator("#how").scrollIntoViewIfNeeded();
  await expect(section).toHaveAttribute("data-reveal", "shown");
  for (const index of [0, 1, 2]) await expect.poll(() => opacity(index)).toBe("1");

  await expect(page.getByRole("heading", { level: 3, name: "Add your document" })).toBeVisible();
  await expect(page.getByText("A blurry photo is flagged instead of quietly accepted.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Ask, then check" })).toBeVisible();
});

test("for a reader who prefers less motion, How it works is simply there, with nothing waiting for a scroll", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto("/");

  await expect(page.locator("#how [data-reveal]")).toHaveAttribute("data-reveal", "shown");
  for (const index of [0, 1, 2]) {
    expect(await page.locator("#how .hiw-card").nth(index).evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  }
});

test("the three scenes in How it works play while it is on screen, and stand still in their finished picture for a reader who prefers less motion", async ({ browser }) => {
  const scenes = [".hiw-s1 .hiw-drop", ".hiw-s2 .hiw-mark", ".hiw-s3 .hiw-ok"];
  const animationOf = (page: import("@playwright/test").Page, selector: string) =>
    page.locator(`#how ${selector}`).first().evaluate((el) => getComputedStyle(el).animationName);

  const moving = await (await browser.newContext({ reducedMotion: "no-preference", viewport: { width: 1280, height: 700 } })).newPage();
  await moving.goto("/");
  // Off screen, the scenes have not started.
  for (const scene of scenes) expect(await animationOf(moving, scene)).toBe("none");
  await moving.locator("#how").scrollIntoViewIfNeeded();
  for (const scene of scenes) await expect.poll(() => animationOf(moving, scene)).not.toBe("none");
  // Three scenes, one for each card, each with its own shape.
  await expect(moving.locator("#how .hiw-art")).toHaveCount(3);
  // Scrolled out of sight again, they pause instead of running for nobody.
  await moving.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => moving.locator("#how .hiw-s1 .hiw-drop").evaluate((el) => getComputedStyle(el).animationPlayState)).toBe("paused");

  const still = await (await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 700 } })).newPage();
  await still.goto("/");
  for (const scene of scenes) expect(await animationOf(still, scene)).toBe("none");
  // The finished picture is there: the check in the first scene and the bar full.
  expect(await still.locator("#how .hiw-s1 .hiw-pop").evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  expect(await still.locator("#how .hiw-s1 .hiw-fill").evaluate((el) => getComputedStyle(el).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
});
