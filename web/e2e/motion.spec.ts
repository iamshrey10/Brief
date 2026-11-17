import { expect, test, type Locator } from "@playwright/test";

import { resetFakeApi, seedAdmin, signInAsTestReader } from "./support/session";

/**
 * Which animation an element is set to play. This is read from the element's computed style, which still says so after the animation
 * has ended, so a slow or a fast machine gets the same answer. Catching an animation part way through would not.
 */
const animationOf = (target: Locator) => target.first().evaluate((element) => getComputedStyle(element).animationName);
/** The part of the page a heading sits in, which is the one that rises in. */
const riseAround = (heading: Locator) => heading.evaluate((element) => getComputedStyle(element.parentElement as HTMLElement).animationName);

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
  await seedAdmin(page);
});

test("the Admin charts draw themselves in, and the page parts rise in one after another", async ({ page }) => {
  await page.goto("/dashboard/admin");
  const heading = page.getByRole("heading", { name: "Admin", level: 1 });
  await expect(heading).toBeVisible();

  expect(await animationOf(page.locator("path.chart-line"))).toBe("chart-draw");
  expect(await animationOf(page.locator(".chart-area"))).toBe("chart-fade");
  expect(await animationOf(page.locator(".chart-bar"))).toBe("chart-grow");
  expect(await riseAround(heading)).toBe("enter");
  // The finished picture is the normal style: once the animations are over, every line is whole and the numbers were there throughout.
  await page.waitForTimeout(2500);
  expect(await page.locator("path.chart-line").first().evaluate((path) => getComputedStyle(path).strokeDashoffset)).toBe("0px");
  await expect(page.getByRole("img", { name: /^People using Brief/ })).toBeVisible();
});

test("a reader who prefers less motion gets no chart animation and no entrance, and every number and chart is simply there", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce", baseURL: "http://localhost:3100" });
  const page = await context.newPage();
  await signInAsTestReader(page);
  await seedAdmin(page);
  await page.goto("/dashboard/admin");
  const heading = page.getByRole("heading", { name: "Admin", level: 1 });
  await expect(heading).toBeVisible();

  expect(await animationOf(page.locator("path.chart-line"))).toBe("none");
  expect(await animationOf(page.locator(".chart-area"))).toBe("none");
  expect(await animationOf(page.locator(".chart-bar"))).toBe("none");
  expect(await riseAround(heading)).toBe("none");
  expect(await page.locator("path.chart-line").first().evaluate((path) => getComputedStyle(path).strokeDashoffset)).toBe("0px");
  await expect(page.getByRole("img", { name: /^People using Brief/ })).toBeVisible();
  await context.close();
});

test("the other pages rise in too, and each is shown whole", async ({ page }) => {
  for (const [path, name] of [
    ["/dashboard/documents", "Your contracts"],
    ["/dashboard/shared", "Shared"],
    ["/dashboard/profile", "Profile"],
  ] as const) {
    await page.goto(path);
    const heading = page.getByRole("heading", { level: 1, name });
    await expect(heading).toBeVisible();
    expect(await riseAround(heading)).toBe("enter");
  }
});

test("the video window eases in when it opens, and not for a reader who prefers less motion", async ({ page, browser }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Watch how it works" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await animationOf(page.getByRole("dialog"))).toBe("dialog-in");

  const context = await browser.newContext({ reducedMotion: "reduce", baseURL: "http://localhost:3100" });
  const calm = await context.newPage();
  await calm.goto("/");
  await calm.getByRole("button", { name: "Watch how it works" }).click();
  await expect(calm.getByRole("dialog")).toBeVisible();
  expect(await animationOf(calm.getByRole("dialog"))).toBe("none");
  await context.close();
});
