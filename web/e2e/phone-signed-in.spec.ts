import { expect, test, type Page } from "@playwright/test";

import { resetFakeApi, seedDocument, signInAsTestReader } from "./support/session";

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
});

async function sidewaysOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test("the dashboard fits a phone, with the whole file name readable and no sideways scrolling", async ({ page }) => {
  await page.goto("/dashboard/documents");
  await expect(page.getByRole("region", { name: "Your documents" }).getByText("sample-lease.pdf")).toBeVisible();

  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
  const name = await page.getByRole("region", { name: "Your documents" }).getByText("sample-lease.pdf").boundingBox();
  expect(name!.x).toBeGreaterThanOrEqual(0);
  expect(name!.x + name!.width).toBeLessThanOrEqual(390);
});

test("the Dashboard home fits a phone, every section inside the screen and no sideways scrolling", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("region", { name: "What Brief found" })).toBeVisible();

  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
  for (const name of ["Your documents at a glance", "Still to ask", "What Brief found", "Recent activity", "By kind"]) {
    const box = await page.getByRole("region", { name }).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }
});

test("the Profile page fits a phone, with the four sections on a row of their own and no sideways scrolling", async ({ page }) => {
  await page.goto("/dashboard/profile");
  await expect(page.getByRole("region", { name: "Today's limits" })).toBeVisible();

  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
  const sections = page.getByRole("navigation", { name: "Sections" }).filter({ visible: true });
  await expect(sections).toHaveCount(1);
  const links = await sections.getByRole("link").all();
  expect(links).toHaveLength(4);
  const boxes = await Promise.all(links.map((link) => link.boundingBox()));
  // All four on one row, and the last one inside the screen.
  expect(new Set(boxes.map((box) => box!.y)).size).toBe(1);
  const last = boxes[3]!;
  expect(last.x + last.width).toBeLessThanOrEqual(390);
});

test("the dashboard's summary of documents fits a phone", async ({ page }) => {
  await page.goto("/dashboard/documents");

  const summary = page.getByRole("group", { name: "Your documents at a glance" });
  await expect(summary).toBeVisible();
  const box = await summary.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
});

test("the document page fits a phone on the Overview", async ({ page }) => {
  await page.goto("/dashboard/documents/doc-lease");
  await expect(page.getByRole("region", { name: "Key terms" }).getByText("Security deposit")).toBeVisible();

  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
});

test("the document page fits a phone on the Ask tab", async ({ page }) => {
  await page.goto("/dashboard/documents/doc-lease");
  await page.getByRole("tab", { name: "Ask" }).click();
  await expect(page.getByRole("textbox", { name: "Your question" })).toBeVisible();

  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
});

test("a delete confirmation fits a phone and its buttons can be reached", async ({ page }) => {
  await page.goto("/dashboard/documents");
  await page.getByRole("button", { name: "Delete sample-lease.pdf" }).click();

  const group = page.getByRole("group", { name: "Delete sample-lease.pdf" });
  await expect(group.getByRole("button", { name: "Cancel" })).toBeInViewport();
  await expect(group.getByRole("button", { name: "Delete", exact: true })).toBeInViewport();
  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
});

test("on a phone the upload form offers to photograph a paper contract, and the photo is picked like a file", async ({ page }) => {
  await page.goto("/dashboard/documents");
  const camera = page.getByText("Take a photo of a paper contract").first();
  await expect(camera).toBeVisible();
  const box = await camera.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(24);

  await page.getByLabel("Take a photo of a paper contract").setInputFiles({ name: "image.jpg", mimeType: "image/jpeg", buffer: Buffer.from("jpeg") });

  await expect(page.getByText("image.jpg")).toBeVisible();
  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
});

async function tooSmall(page: Page, names: (string | RegExp)[], role: "button" | "link" | "tab" = "button"): Promise<string[]> {
  const small: string[] = [];
  for (const name of names) {
    const target = page.getByRole(role, { name, exact: typeof name === "string" }).first();
    await expect(target).toBeVisible();
    const box = await target.boundingBox();
    if (box!.height < 43.5 || box!.width < 43.5) small.push(`${name}: ${Math.round(box!.width)}x${Math.round(box!.height)}`);
  }
  return small;
}

test("on a phone the buttons a thumb has to hit are at least 44 pixels each way", async ({ page }) => {
  await page.goto("/dashboard/documents");
  await expect(page.getByRole("region", { name: "Your documents" }).getByText("sample-lease.pdf")).toBeVisible();

  expect(await tooSmall(page, ["Edit sample-lease.pdf", "Read sample-lease.pdf again", "View original sample-lease.pdf", "Delete sample-lease.pdf", "Upload"])).toEqual([]);
  expect(await tooSmall(page, ["Dashboard", "Documents", "Shared", "Profile"], "link")).toEqual([]);
  for (const label of ["Search your documents", "Show documents of kind", "Sort documents"]) {
    const box = await page.getByLabel(label).boundingBox();
    expect(box!.height, label).toBeGreaterThanOrEqual(43.5);
  }
});

test("on a phone the Find box has a full row, and its arrows, chips and questions are 44 pixels", async ({ page }) => {
  await page.goto("/dashboard/documents/doc-lease");
  await expect(page.getByRole("region", { name: "Key terms" }).getByText("Security deposit")).toBeVisible();

  const find = await page.getByRole("searchbox", { name: "Find in this document" }).boundingBox();
  expect(find!.width).toBeGreaterThan(300);
  expect(find!.height).toBeGreaterThanOrEqual(43.5);
  expect(await tooSmall(page, ["Previous match", "Next match", /^Show "Security deposit" in the document/])).toEqual([]);

  await page.getByRole("tab", { name: "Ask" }).click();
  const suggestions = page.getByRole("list", { name: "Suggested questions" }).getByRole("button");
  await expect(suggestions.first()).toBeVisible();
  for (const box of await suggestions.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) expect(box).toBeGreaterThanOrEqual(43.5);
  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
});

test("on a phone the sections are a bar fixed to the bottom of the screen, and the end of a page is not hidden behind it", async ({ page }) => {
  await page.goto("/dashboard/documents");
  const bar = page.getByRole("navigation", { name: "Sections" }).last();
  await expect(bar).toBeVisible();

  const box = await bar.boundingBox();
  expect(box!.y + box!.height).toBeCloseTo(844, 0);
  for (const name of ["Dashboard", "Documents", "Shared", "Profile"]) {
    const link = await bar.getByRole("link", { name }).boundingBox();
    expect(link!.height, name).toBeGreaterThanOrEqual(43.5);
    expect(link!.width, name).toBeGreaterThanOrEqual(43.5);
  }
  await expect(bar.getByRole("link", { name: "Documents" })).toHaveAttribute("aria-current", "page");

  // The row of sections under the name is gone: the top bar is one row.
  const top = await page.locator("header").first().boundingBox();
  expect(top!.height).toBeLessThanOrEqual(60);

  // Scrolled to the bottom, the last thing on the page ends above the bar.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const footer = await page.getByRole("navigation", { name: "Legal" }).boundingBox();
  expect(footer!.y + footer!.height).toBeLessThanOrEqual(box!.y);

  await bar.getByRole("link", { name: "Profile" }).click();
  await expect(page).toHaveURL(/\/dashboard\/profile$/);
});

test("on a laptop the sections stay beside the name and there is no bar at the bottom", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, baseURL: "http://localhost:3100" });
  const page = await context.newPage();
  await signInAsTestReader(page);
  await page.goto("/dashboard");

  // Only one bar of sections is shown (hidden ones are not found by role), and it is the one beside the name.
  const bars = page.getByRole("navigation", { name: "Sections" });
  await expect(bars).toHaveCount(1);
  await expect(page.locator("header").getByRole("navigation", { name: "Sections" })).toBeVisible();
  await expect(page.locator("nav[aria-label=Sections].fixed")).toBeHidden();
  await context.close();
});

test("on a phone the Ask box is compact: suggestions in one row that scrolls sideways, a one line question box, and asking still works", async ({ page }) => {
  await page.goto("/dashboard/documents/doc-lease");
  await page.getByRole("tab", { name: "Ask" }).click();

  const suggestions = page.getByRole("list", { name: "Suggested questions" });
  await expect(suggestions).toBeVisible();
  const row = await suggestions.evaluate((el) => ({ scrolls: el.scrollWidth > el.clientWidth, height: el.getBoundingClientRect().height }));
  expect(row.scrolls).toBe(true);
  expect(row.height).toBeLessThan(70);
  const panel = await page.getByRole("region", { name: "Ask about this document" }).boundingBox();
  expect(panel!.height).toBeLessThan(300);
  const box = await page.getByRole("textbox", { name: "Your question" }).boundingBox();
  expect(box!.height).toBeLessThan(50);

  await page.getByRole("textbox", { name: "Your question" }).fill("What is the late fee?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByRole("log", { name: "Conversation" }).getByText("From the document")).toBeVisible();
  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
});

test("on a phone an answer is shown whole, its source can be tapped, and the question box stays above the bar", async ({ page }) => {
  await page.goto("/dashboard/documents/doc-lease");
  await page.getByRole("tab", { name: "Ask" }).click();
  await page.getByRole("textbox", { name: "Your question" }).fill("What is the security deposit?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();

  const log = page.getByRole("log", { name: "Conversation" });
  await expect(log.getByText("From the document")).toBeVisible();
  // Nothing in the conversation is cut off: every message ends inside the log, which has grown to hold it.
  const cut = await log.evaluate((el) => Array.from(el.children).filter((child) => child.getBoundingClientRect().bottom > el.getBoundingClientRect().bottom + 1).length);
  expect(cut).toBe(0);

  await log.getByRole("button", { name: /^Page 1 .security deposit of \$1,450\.00/ }).click();
  await expect(page.locator("mark")).toHaveText("security deposit of $1,450.00");
  await expect(page.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");

  const form = await page.getByRole("textbox", { name: "Your question" }).boundingBox();
  const bar = await page.getByRole("navigation", { name: "Sections" }).last().boundingBox();
  expect(form!.y + form!.height).toBeLessThanOrEqual(bar!.y);
});

test("on a phone the red number for a waiting request sits on the Shared tab of the bottom bar, and is read after the tab's name", async ({ page }) => {
  await page.goto("/dashboard/shared#sharing");
  await page.getByLabel(/Who is it for/).fill("Mum");
  await page.getByRole("button", { name: "Create invitation" }).click();
  const link = await page.getByRole("region", { name: "New invitation" }).getByLabel("Invitation link").inputValue();
  await page.goto(new URL(link).pathname);
  await page.getByLabel("Six digit code").fill("482913");
  await page.getByRole("button", { name: "Ask for access" }).click();
  await expect(page.getByRole("status")).toContainText("Your request was sent to");

  await page.goto("/dashboard");
  const bar = page.getByRole("navigation", { name: "Sections" }).last();
  const shared = bar.getByRole("link", { name: /^Shared.*1 person is waiting for your approval/ });
  await expect(shared).toBeVisible();
  const tab = await shared.boundingBox();
  const badge = await shared.locator("span[aria-hidden=true].bg-red-600").boundingBox();
  expect(badge!.x).toBeGreaterThanOrEqual(tab!.x);
  expect(badge!.x + badge!.width).toBeLessThanOrEqual(tab!.x + tab!.width);
});

test("a very long file name wraps instead of running off a narrow phone, on every page that shows it", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const name = "final-signed-lease-agreement-for-the-apartment-at-1234-north-mill-avenue-tempe-arizona-2026-2027.pdf";
  await seedDocument(page, { id: "doc-long", filename: name, doc_type: "lease", status: "ready", ocr_confidence: null, created_at: "2026-10-03T12:00:00Z", status_changed_at: "2026-10-03T12:01:00Z" });

  for (const path of ["/dashboard", "/dashboard/documents", "/dashboard/documents/doc-long"]) {
    await page.goto(path);
    await expect(page.getByText(name).first()).toBeVisible();
    expect(await sidewaysOverflow(page), path).toBeLessThanOrEqual(0);
    const boxes = await page.getByText(name).evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return [r.left, r.right]; }));
    for (const [left, right] of boxes) {
      expect(left, path).toBeGreaterThanOrEqual(0);
      expect(right, path).toBeLessThanOrEqual(360);
    }
  }
});
