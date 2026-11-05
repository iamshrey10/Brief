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

test("See how it works scrolls to How it works, which comes after What you get, and the page has the attribute Next needs for smooth scrolling", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-scroll-behavior", "smooth");
  await expect(page.getByRole("navigation", { name: "Sections" })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2, name: "What you get" })).toBeAttached();
  const features = (await page.getByRole("heading", { level: 2, name: "What you get" }).boundingBox())!;
  const how = (await page.getByRole("heading", { level: 2, name: "How it works" }).boundingBox())!;
  expect(features.y).toBeLessThan(how.y);

  await page.getByRole("link", { name: "See how it works" }).click();
  await expect(page).toHaveURL(/#how$/);
  await expect(page.getByRole("heading", { level: 2, name: "How it works" })).toBeInViewport();
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

for (const [name, width, height] of [["a laptop", 1440, 900], ["a wide monitor", 1920, 1080], ["a small laptop", 1280, 720], ["a tablet", 820, 1180], ["a phone", 390, 844]] as const)
  test(`on ${name} the landing page is three screens: the hero, What you get, and How it works, each at least as tall as the window below the top bar`, async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" })).newPage();
    await page.goto("/");
    const header = (await page.locator("header").first().boundingBox())!;
    const room = height - (header.y + header.height) - 2;

    const heroBox = (await page.locator("section").first().locator("xpath=..").boundingBox())!;
    const featuresBox = (await page.locator("#features").boundingBox())!;
    const howBox = (await page.locator("#how").boundingBox())!;
    expect(Math.abs(heroBox.y - (header.y + header.height))).toBeLessThanOrEqual(2);
    for (const box of [heroBox, featuresBox, howBox]) expect(box.height).toBeGreaterThanOrEqual(room);
    expect(Math.abs(featuresBox.y - (heroBox.y + heroBox.height))).toBeLessThanOrEqual(2);
    expect(Math.abs(howBox.y - (featuresBox.y + featuresBox.height))).toBeLessThanOrEqual(2);
    // The headline and the way in are inside the first screen, and nothing runs off the side.
    await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
    if (width >= 820) await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

test("What you get waits for you to reach it, then brings its heading and three cards in one after another", async ({ page }) => {
  await page.goto("/");
  const wrapper = page.locator("#features [data-reveal]");
  await expect(wrapper).toHaveAttribute("data-reveal", "armed");

  await page.locator("#features").scrollIntoViewIfNeeded();
  await expect(wrapper).toHaveAttribute("data-reveal", "shown");
  await expect(page.getByRole("heading", { level: 3, name: "Answers you can check" })).toBeVisible();
  expect(await page.locator("#features .hiw-card").count()).toBe(4);
});
