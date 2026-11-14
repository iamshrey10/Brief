import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { resetFakeApi, signInAsTestReader, uploadsReceived } from "./support/session";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
});

/** About what a phone camera makes: a few megabytes that start like a JPEG. */
function photo(megabytes = 3): Buffer {
  const bytes = Buffer.alloc(megabytes * 1024 * 1024, 7);
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]).copy(bytes);
  return bytes;
}

async function takePhoto(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }) {
  await page.goto("/dashboard/documents");
  await page.getByLabel("Take a photo of a paper contract").setInputFiles(file);
}

const chooseLease = (page: Page) => page.getByRole("radio", { name: "Lease" }).check({ force: true });

test.describe("on a phone held upright", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("a photo from the camera is chosen, asks what kind it is, uploads in full and appears in the list", async ({ page }) => {
    await takePhoto(page, { name: "image.jpg", mimeType: "image/jpeg", buffer: photo(3) });

    await expect(page.getByText("image.jpg")).toBeVisible();
    await expect(page.getByText("Choose what kind of document it is")).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload" })).toBeDisabled();

    await chooseLease(page);
    await page.getByRole("button", { name: "Upload" }).click();

    await expect(page.getByRole("region", { name: "Your documents" }).getByText("image.jpg")).toBeVisible({ timeout: 15000 });
    const received = await uploadsReceived(page);
    expect(received).toHaveLength(1);
    expect(received[0].contentType).toBe("image/jpeg");
    expect(received[0].bytes).toBe(3 * 1024 * 1024);
  });

  test("a photo a phone calls HEIF goes up as HEIC instead of being refused", async ({ page }) => {
    await takePhoto(page, { name: "IMG_0042.heif", mimeType: "image/heif", buffer: photo(2) });

    await expect(page.getByText("IMG_0042.heif")).toBeVisible();
    await expect(page.getByText("That kind of file isn't supported")).toHaveCount(0);
    await chooseLease(page);
    await page.getByRole("button", { name: "Upload" }).click();

    await expect(page.getByRole("region", { name: "Your documents" }).getByText("IMG_0042.heif")).toBeVisible({ timeout: 15000 });
    expect((await uploadsReceived(page))[0].contentType).toBe("image/heic");
  });

  test("a photo over the size limit is refused with the reason, before anything is sent", async ({ page }) => {
    const file = path.join(os.tmpdir(), "brief-huge.jpg");
    fs.writeFileSync(file, photo(51));
    try {
      await takePhoto(page, file);
      await expect(page.locator("p[role=alert]")).toContainText("50 MB");
      expect(await uploadsReceived(page)).toHaveLength(0);
    } finally {
      fs.rmSync(file, { force: true });
    }
  });

  test("a file that is not a photo or a PDF is refused with the reason", async ({ page }) => {
    await takePhoto(page, { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });

    await expect(page.locator("p[role=alert]")).toContainText("isn't supported");
  });
});

test.describe("on a phone held sideways", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test("the camera button is still there, because the screen is a touch screen", async ({ page }) => {
    await page.goto("/dashboard/documents");

    await expect(page.getByText("Take a photo of a paper contract").first()).toBeVisible();
  });
});

test.describe("on a computer", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("there is no camera button, because a computer has no use for it", async ({ page }) => {
    await page.goto("/dashboard/documents");

    await expect(page.getByText("Take a photo of a paper contract")).toBeHidden();
  });
});
