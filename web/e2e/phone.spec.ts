import { expect, test } from "@playwright/test";

for (const scheme of ["dark", "light"] as const) {
  test(`the landing page fits a phone in ${scheme} mode, with no sideways scrolling`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme });
    const page = await context.newPage();
    await page.goto("/");

    const signIn = page.getByRole("button", { name: "Sign in with Google" });
    await expect(signIn).toBeVisible();
    const box = await signIn.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await context.close();
  });
}
