// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { photoToPage } from "./photos-pdf";

const close = vi.fn();
let bitmap = { width: 4000, height: 3000, close };
const fills: string[] = [];
const draws: number[][] = [];
let context: unknown;
let blob: Blob | null;

beforeEach(() => {
  close.mockReset();
  fills.length = 0;
  draws.length = 0;
  bitmap = { width: 4000, height: 3000, close };
  blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" });
  context = {
    set fillStyle(value: string) {
      fills.push(value);
    },
    fillRect: vi.fn(),
    drawImage: (_b: unknown, ...rest: number[]) => draws.push(rest),
  };
  vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => context as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(blob));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const file = new File(["x"], "page.jpg", { type: "image/jpeg" });

describe("photoToPage", () => {
  it("opens the photo the right way up, and shrinks it so its longer side is the most allowed", async () => {
    const page = await photoToPage(file, 2000);

    expect(createImageBitmap).toHaveBeenCalledWith(file, { imageOrientation: "from-image" });
    expect(page.width).toBe(2000);
    expect(page.height).toBe(1500);
    expect(Array.from(page.jpeg)).toEqual([0xff, 0xd8, 0xff, 0xd9]);
    expect(draws[0]).toEqual([0, 0, 2000, 1500]);
  });

  it("does not make a small photo bigger", async () => {
    bitmap = { width: 800, height: 600, close };

    const page = await photoToPage(file, 2600);

    expect([page.width, page.height]).toEqual([800, 600]);
  });

  it("puts paper white under the photo, so a transparent picture does not turn black", async () => {
    await photoToPage(file);

    expect(fills).toContain("#ffffff");
  });

  it("lets go of the opened photo, whether it worked or not", async () => {
    await photoToPage(file);
    blob = null;
    await expect(photoToPage(file)).rejects.toThrow("could not save the photo");

    expect(close).toHaveBeenCalledTimes(2);
  });

  it("fails when the browser cannot open the photo, so the form can say so", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => Promise.reject(new Error("cannot decode"))));

    await expect(photoToPage(file)).rejects.toThrow("cannot decode");
  });

  it("fails when there is no canvas to draw on", async () => {
    context = null;

    await expect(photoToPage(file)).rejects.toThrow("no canvas");
    expect(close).toHaveBeenCalled();
  });
});
