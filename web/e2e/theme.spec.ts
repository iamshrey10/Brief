import { expect, test } from "@playwright/test";

for (const start of ["dark", "light"] as const) {
  const other = start === "dark" ? "light" : "dark";

  test(`switches from ${start} to ${other} mode and keeps the choice after a reload`, async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: start });
    const page = await context.newPage();
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).toHaveClass(new RegExp(`\\b${start}\\b`));

    await page.getByRole("button", { name: other === "light" ? "Light mode" : "Dark mode" }).click();

    await expect(html).toHaveClass(new RegExp(`\\b${other}\\b`));
    await page.reload();
    await expect(html).toHaveClass(new RegExp(`\\b${other}\\b`));
    await context.close();
  });
}

test("follows the computer's setting until the visitor chooses", async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: "light" });
  const page = await context.newPage();
  await page.goto("/");

  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
  await context.close();
});
