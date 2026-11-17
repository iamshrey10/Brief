import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { resetFakeApi, signInAsTestReader } from "./support/session";
import { settled } from "./support/settled";

/** What a scan finds wrong, with where, so a failure says what to fix. */
async function problems(page: Page): Promise<string[]> {
  // A button the mouse is resting on is drawn in its hover colour, which is lighter. That belongs to the button, and is not what is being checked here.
  await page.mouse.move(0, 0);
  await settled(page);
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.map((violation) => `${violation.id} (${violation.impact}): ${violation.nodes.map((node) => `${node.target.join(" ")} ${node.any[0]?.message ?? ""}`).slice(0, 3).join(" | ")}`);
}

/** A day this many days from now, as the date field wants it, so no test depends on the date it is run on. */
function inDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const card = (page: Page) => page.getByRole("region", { name: "Reminders", exact: true });
const dialog = (page: Page) => page.getByRole("dialog");

async function add(page: Page, title: string, extra: { date?: string; time?: string; note?: string; document?: string } = {}) {
  await card(page).getByRole("button", { name: "Add a reminder" }).click();
  await dialog(page).getByLabel(/^Title/).fill(title);
  if (extra.date) await dialog(page).getByLabel(/^Date/).fill(extra.date);
  if (extra.time) await dialog(page).getByLabel(/^Time/).fill(extra.time);
  if (extra.note) await dialog(page).getByLabel(/^Description/).fill(extra.note);
  if (extra.document) await dialog(page).getByLabel(/^Linked document/).selectOption({ label: extra.document });
  await dialog(page).getByRole("button", { name: "Add reminder" }).click();
}

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
});

test("the Reminders card has a small plus button level with its heading, and the lease reminder is still there", async ({ page }) => {
  await page.goto("/dashboard");

  const plus = card(page).getByRole("button", { name: "Add a reminder" });
  const heading = card(page).getByRole("heading", { level: 2, name: "Reminders" });
  await expect(plus).toBeVisible();
  const [plusBox, headingBox] = [await plus.boundingBox(), await heading.boundingBox()];
  expect(plusBox!.width).toBeLessThanOrEqual(40);
  expect(Math.abs(plusBox!.y + plusBox!.height / 2 - (headingBox!.y + headingBox!.height / 2))).toBeLessThan(8);
  expect(plusBox!.x).toBeGreaterThan(headingBox!.x);
  // What was found in a document is kept apart from the person's own reminders, with the lease bell untouched.
  await expect(card(page).getByRole("heading", { level: 3, name: "From your documents" })).toBeVisible();
  await expect(card(page).getByRole("heading", { level: 3, name: "Your reminders" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Lease remaining" }).getByRole("button", { name: "Remind me in my calendar" })).toBeVisible();
  await expect(card(page).getByText(/Nothing here yet/)).toBeVisible();
});

test("a reminder can be made with no document, and is still there after a reload", async ({ page }) => {
  await page.goto("/dashboard");

  await add(page, "Call the landlord", { date: inDays(3) });

  await expect(dialog(page)).toBeHidden();
  await expect(card(page).getByRole("status")).toHaveText("Reminder added.");
  const item = card(page).getByRole("listitem").filter({ hasText: "Call the landlord" });
  await expect(item).toContainText("In 3 days");
  await expect(item.getByRole("link")).toHaveCount(0);

  await page.reload();
  await expect(card(page).getByRole("listitem").filter({ hasText: "Call the landlord" })).toContainText("In 3 days");
});

test("a reminder can carry a time, a note and one of the person's documents", async ({ page }) => {
  await page.goto("/dashboard");

  await add(page, "Ask about the deposit", { date: inDays(1), time: "14:30", note: "Bring the lease", document: "sample-lease.pdf" });

  const item = card(page).getByRole("listitem").filter({ hasText: "Ask about the deposit" });
  await expect(item).toContainText("Tomorrow");
  await expect(item).toContainText("2:30 PM");
  await expect(item).toContainText("Bring the lease");
  await expect(item.getByRole("link", { name: "sample-lease.pdf" })).toHaveAttribute("href", "/dashboard/documents/doc-lease");

  await page.reload();
  await expect(card(page).getByRole("listitem").filter({ hasText: "Ask about the deposit" }).getByRole("link", { name: "sample-lease.pdf" })).toBeVisible();
});

test("a reminder can be edited, and the change is kept", async ({ page }) => {
  await page.goto("/dashboard");
  await add(page, "Renew the lease", { date: inDays(10) });

  await card(page).getByRole("button", { name: "Edit reminder: Renew the lease" }).click();
  await expect(dialog(page).getByRole("heading", { name: "Edit reminder" })).toBeVisible();
  await expect(dialog(page).getByLabel(/^Title/)).toHaveValue("Renew the lease");
  await dialog(page).getByLabel(/^Title/).fill("Renew the lease before it ends");
  await dialog(page).getByLabel(/^Date/).fill(inDays(20));
  await dialog(page).getByRole("button", { name: "Save changes" }).click();

  await expect(card(page).getByRole("status")).toHaveText("Reminder updated.");
  await expect(card(page).getByText("Renew the lease before it ends")).toBeVisible();
  await expect(card(page).getByText("Renew the lease", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(card(page).getByRole("listitem").filter({ hasText: "Renew the lease before it ends" })).toBeVisible();
});

test("a reminder can be ticked off, and brought back, and both are kept", async ({ page }) => {
  await page.goto("/dashboard");
  await add(page, "Send the signed copy", { date: inDays(2) });

  await card(page).getByRole("button", { name: "Mark as done: Send the signed copy" }).click();

  await expect(card(page).getByRole("button", { name: "Show done (1)" })).toBeVisible();
  await expect(card(page).getByText("Everything is done.")).toBeVisible();
  await page.reload();
  await card(page).getByRole("button", { name: "Show done (1)" }).click();
  const done = card(page).getByRole("button", { name: "Mark as not done: Send the signed copy" });
  await expect(done).toHaveAttribute("aria-pressed", "true");

  await done.click();
  await expect(card(page).getByRole("button", { name: /Show done/ })).toHaveCount(0);
  await page.reload();
  await expect(card(page).getByRole("button", { name: "Mark as done: Send the signed copy" })).toBeVisible();
});

test("a reminder is deleted only after it is confirmed, and stays deleted", async ({ page }) => {
  await page.goto("/dashboard");
  await add(page, "Cancel the gym", { date: inDays(5) });

  await card(page).getByRole("button", { name: "Delete reminder: Cancel the gym" }).click();
  await card(page).getByRole("button", { name: "Keep it" }).click();
  await expect(card(page).getByText("Cancel the gym")).toBeVisible();

  await card(page).getByRole("button", { name: "Delete reminder: Cancel the gym" }).click();
  await card(page).getByRole("group", { name: /Delete Cancel the gym/ }).getByRole("button", { name: "Delete" }).click();

  await expect(card(page).getByRole("status")).toHaveText("Reminder deleted.");
  await expect(card(page).getByText("Cancel the gym")).toHaveCount(0);
  await page.reload();
  await expect(card(page).getByText("Cancel the gym")).toHaveCount(0);
  await expect(card(page).getByText(/Nothing here yet/)).toBeVisible();
});

test("a reminder cannot be made for a day that has passed, but one that has become overdue shows as overdue and can still be edited", async ({ page }) => {
  await page.goto("/dashboard");

  await card(page).getByRole("button", { name: "Add a reminder" }).click();
  await dialog(page).getByLabel(/^Title/).fill("Too late");
  await dialog(page).getByLabel(/^Date/).fill(inDays(-3));
  await dialog(page).getByRole("button", { name: "Add reminder" }).click();
  await expect(dialog(page).getByRole("alert")).toHaveText("Choose today or a later date.");
  await page.keyboard.press("Escape");

  // A reminder whose day has gone by since it was made, which the API allows.
  const made = await page.request.post("/api/backend/me/reminders", { data: { title: "Pay the deposit", due_date: inDays(-4) } });
  expect(made.status()).toBe(201);
  await page.reload();
  await expect(card(page).getByText(/Overdue by 4 days/)).toBeVisible();

  await card(page).getByRole("button", { name: "Edit reminder: Pay the deposit" }).click();
  await dialog(page).getByLabel(/^Title/).fill("Pay the deposit today");
  await dialog(page).getByRole("button", { name: "Save changes" }).click();
  await expect(card(page).getByText("Pay the deposit today")).toBeVisible();
  await expect(card(page).getByText(/Overdue by 4 days/)).toBeVisible();
});

test.describe("when something is wrong", () => {
  test("a missing title is said beside the field, and nothing is saved", async ({ page }) => {
    await page.goto("/dashboard");

    await card(page).getByRole("button", { name: "Add a reminder" }).click();
    await dialog(page).getByRole("button", { name: "Add reminder" }).click();

    await expect(dialog(page).getByRole("alert")).toHaveText("Give the reminder a title.");
    await expect(dialog(page).getByLabel(/^Title/)).toBeFocused();
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(card(page).getByText(/Nothing here yet/)).toBeVisible();
  });

  test("a missing date is said beside the field", async ({ page }) => {
    await page.goto("/dashboard");

    await card(page).getByRole("button", { name: "Add a reminder" }).click();
    await dialog(page).getByLabel(/^Title/).fill("No date");
    await dialog(page).getByLabel(/^Date/).fill("");
    await dialog(page).getByRole("button", { name: "Add reminder" }).click();

    await expect(dialog(page).getByRole("alert")).toHaveText("Choose a date.");
    await expect(dialog(page).getByLabel(/^Date/)).toBeFocused();
  });

  test("a refusal from the server is shown in the window, which stays open with what was typed", async ({ page }) => {
    await signInAsTestReader(page, "reminders-fail");
    await page.goto("/dashboard");

    await add(page, "Will not save", { date: inDays(2) });

    await expect(dialog(page).getByRole("alert")).toContainText("Something went wrong on our side");
    await expect(dialog(page).getByLabel(/^Title/)).toHaveValue("Will not save");
    await expect(dialog(page).getByRole("button", { name: "Add reminder" })).toBeEnabled();
    await expect(card(page).getByText("Will not save")).toHaveCount(0);
  });

  test("when the reminders cannot be loaded the rest of the dashboard still works, and the card says so", async ({ page }) => {
    await signInAsTestReader(page, "reminders-down");
    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await expect(card(page).getByText(/could not be loaded just now/)).toBeVisible();
    await expect(page.getByRole("region", { name: "Lease remaining" })).toBeVisible();
    await expect(card(page).getByRole("button", { name: "Add a reminder" })).toBeVisible();
  });

  test("pressing Add again and again while it is saving makes one reminder", async ({ page }) => {
    await signInAsTestReader(page, "slow-reminders");
    await page.goto("/dashboard");

    await card(page).getByRole("button", { name: "Add a reminder" }).click();
    await dialog(page).getByLabel(/^Title/).fill("Only once");
    const addButton = dialog(page).getByRole("button", { name: "Add reminder" });
    await addButton.dblclick();
    await expect(dialog(page).getByRole("button", { name: "Saving..." })).toBeDisabled();
    await expect(dialog(page)).toBeHidden();

    await page.reload();
    await expect(card(page).getByRole("listitem").filter({ hasText: "Only once" })).toHaveCount(1);
  });
});

test("one person's reminders are never shown to, or changed by, another", async ({ page }) => {
  await page.goto("/dashboard");
  await add(page, "Private to the first reader", { date: inDays(3) });
  await expect(card(page).getByText("Private to the first reader")).toBeVisible();
  const [mine] = (await (await page.request.get("/api/backend/me/reminders")).json()) as { id: string }[];

  await signInAsTestReader(page);
  await page.goto("/dashboard");

  await expect(card(page).getByText(/Nothing here yet/)).toBeVisible();
  await expect(page.getByText("Private to the first reader")).toHaveCount(0);
  expect(await (await page.request.get("/api/backend/me/reminders")).json()).toEqual([]);
  expect((await page.request.patch(`/api/backend/me/reminders/${mine.id}`, { data: { title: "taken over" } })).status()).toBe(404);
  expect((await page.request.delete(`/api/backend/me/reminders/${mine.id}`)).status()).toBe(404);
});

test("a person who is not signed in cannot read or add reminders", async ({ browser }) => {
  const stranger = await browser.newContext();
  const page = await stranger.newPage();

  const read = await page.request.get("/api/backend/me/reminders");
  const write = await page.request.post("/api/backend/me/reminders", { data: { title: "x", due_date: inDays(1) } });

  expect([read.status(), write.status()]).toEqual([401, 401]);
  await stranger.close();
});

test("the whole thing works from the keyboard, and focus goes back to the plus button", async ({ page }) => {
  await page.goto("/dashboard");

  const plus = card(page).getByRole("button", { name: "Add a reminder" });
  await plus.focus();
  await page.keyboard.press("Enter");
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByLabel(/^Title/)).toBeFocused();
  await page.keyboard.type("Typed with the keyboard");
  await page.keyboard.press("Escape");

  await expect(dialog(page)).toBeHidden();
  await expect(plus).toBeFocused();
  await expect(card(page).getByText("Typed with the keyboard")).toHaveCount(0);
});

test("the window opens and closes with Escape, Cancel and a click outside it, saving nothing", async ({ page }) => {
  await page.goto("/dashboard");
  const plus = card(page).getByRole("button", { name: "Add a reminder" });

  await plus.click();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();

  await plus.click();
  await dialog(page).getByRole("button", { name: "Cancel" }).click();
  await expect(dialog(page)).toBeHidden();

  await plus.click();
  await page.mouse.click(5, 5);
  await expect(dialog(page)).toBeHidden();
  await expect(card(page).getByText(/Nothing here yet/)).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} mode`, () => {
    test.use({ colorScheme: scheme });

    test("the card with reminders, and the window, have nothing a scan can find wrong", async ({ page }) => {
      await page.goto("/dashboard");
      await add(page, "Scan me", { date: inDays(2), note: "A note", document: "sample-lease.pdf" });
      await expect(card(page).getByText("Scan me")).toBeVisible();
      expect(await problems(page)).toEqual([]);

      await card(page).getByRole("button", { name: "Add a reminder" }).click();
      await dialog(page).getByRole("button", { name: "Add reminder" }).click();
      await expect(dialog(page).getByRole("alert")).toBeVisible();
      expect(await problems(page)).toEqual([]);
    });
  });
}

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 700 } });

  test("the card fits, the plus button is easy to tap, and the window fits the screen with its buttons reachable", async ({ page }) => {
    await page.goto("/dashboard");
    await add(page, "A reminder with a rather long title to see how it wraps on a narrow screen", { date: inDays(2), note: "A long note ".repeat(8) });
    await expect(card(page).getByRole("listitem")).toHaveCount(1);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const name of [/Edit reminder/, /Delete reminder/, /Mark as done/, "Add a reminder"]) {
      const box = await card(page).getByRole("button", { name }).first().boundingBox();
      expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(44);
    }

    await card(page).getByRole("button", { name: "Add a reminder" }).click();
    const box = (await dialog(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    expect(box.y + box.height).toBeLessThanOrEqual(700);
    await expect(dialog(page).getByRole("button", { name: "Add reminder" })).toBeInViewport();
    await expect(dialog(page).getByRole("button", { name: "Cancel" })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("a reminder can be made on a phone from start to finish", async ({ page }) => {
    await page.goto("/dashboard");

    await add(page, "Phone reminder", { date: inDays(4), time: "08:15" });

    await expect(card(page).getByRole("listitem").filter({ hasText: "Phone reminder" })).toContainText("8:15 AM");
  });
});
