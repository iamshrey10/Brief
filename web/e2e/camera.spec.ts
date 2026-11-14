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

/** A real photo-sized picture with some text on it, made in the page, as a JPEG file. */
async function pagePhoto(page: Page, label: string): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const base64 = await page.evaluate((text) => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 1200;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#f4f1ea";
    context.fillRect(0, 0, 900, 1200);
    context.fillStyle = "#111";
    context.font = "48px sans-serif";
    context.fillText(text, 60, 140);
    return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
  }, label);
  return { name: `${label.replace(/\W+/g, "-").toLowerCase()}.jpg`, mimeType: "image/jpeg", buffer: Buffer.from(base64, "base64") };
}

test.describe("several photos make one document, on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("three photos taken one after another become one PDF with a page for each, and appear as one document", async ({ page }) => {
    await page.goto("/dashboard/documents");
    await page.getByLabel("Take a photo of a paper contract").setInputFiles(await pagePhoto(page, "Lease page one"));
    await expect(page.getByText("Add photos (1 of 5)")).toBeVisible();
    await page.getByLabel("Add another page with the camera").setInputFiles(await pagePhoto(page, "Lease page two"));
    await page.getByLabel("Add another page with the camera").setInputFiles(await pagePhoto(page, "Lease page three"));

    const pages = page.getByRole("list", { name: /^Pages, 3 of 5/ }).getByRole("listitem");
    await expect(pages).toHaveCount(3);
    await expect(pages.nth(0)).toContainText("Page 1");
    await expect(page.getByText(/These 3 photos become one document/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.getByRole("button", { name: "Move page 3 earlier" }).click();
    await expect(pages.nth(1)).toContainText("lease-page-three.jpg");
    await chooseLease(page);
    await page.getByRole("button", { name: "Upload" }).click();

    await expect(page.getByRole("region", { name: "Your documents" }).getByText(/contract-photos-.*-3-pages\.pdf/)).toBeVisible({ timeout: 20000 });
    const received = await uploadsReceived(page);
    expect(received).toHaveLength(1);
    expect(received[0].contentType).toBe("application/pdf");
    expect(received[0].bytes).toBeGreaterThan(3 * 3000);
  });

  test("a sixth photo is left out with a note, and the thumbnails are shown", async ({ page }) => {
    await page.goto("/dashboard/documents");
    const photos = [];
    for (let i = 1; i <= 6; i++) photos.push(await pagePhoto(page, `Page ${i}`));

    await page.getByLabel("Choose a file to upload").setInputFiles(photos);

    await expect(page.getByRole("list", { name: /^Pages, 5 of 5/ }).getByRole("listitem")).toHaveCount(5);
    await expect(page.getByText("Up to 5 photos make one document, so the rest were left out.")).toBeVisible();
    await expect(page.locator("li img")).toHaveCount(5);
    await expect(page.getByLabel("Add another page with the camera")).toHaveCount(0);
  });

  test("a photo the browser cannot open says so in words, and nothing is sent", async ({ page }) => {
    await page.goto("/dashboard/documents");
    await page.getByLabel("Choose a file to upload").setInputFiles([
      await pagePhoto(page, "Good page"),
      { name: "broken.heic", mimeType: "image/heic", buffer: Buffer.from("not really a photo") },
    ]);
    await chooseLease(page);

    await page.getByRole("button", { name: "Upload" }).click();

    await expect(page.locator("p[role=alert]")).toContainText("One of those photos could not be opened here");
    expect(await uploadsReceived(page)).toHaveLength(0);
  });

  test("the same steps work on a phone held sideways", async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto("/dashboard/documents");
    await page.getByLabel("Choose a file to upload").setInputFiles([await pagePhoto(page, "One"), await pagePhoto(page, "Two")]);

    await expect(page.getByRole("list", { name: /^Pages, 2 of 5/ }).getByRole("listitem")).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
