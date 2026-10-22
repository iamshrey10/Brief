import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");

/** The colour variables inside one block of the stylesheet, such as `:root` or `.dark`. */
function variablesIn(selector: string): Record<string, string> {
  const start = CSS.indexOf(`${selector} {`);
  const end = CSS.indexOf("\n}", start);
  const block = CSS.slice(start, end);
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9A-Fa-f]{6});/g)].map((m) => [m[1], m[2]]));
}

type Rgb = [number, number, number];

const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;

/** The colour `top` shows as when painted over `under` at the given opacity, as a browser blends it. */
const blend = (top: Rgb, under: Rgb, opacity: number): Rgb =>
  top.map((channel, i) => channel * opacity + under[i] * (1 - opacity)) as Rgb;

function luminance([r, g, b]: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrast(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe("the contrast helper", () => {
  it("gives 21 for black on white and 1 for a colour on itself", () => {
    expect(contrast(rgb("#000000"), rgb("#FFFFFF"))).toBeCloseTo(21, 0);
    expect(contrast(rgb("#4F46E5"), rgb("#4F46E5"))).toBeCloseTo(1, 5);
  });
});

describe.each([
  ["light", ":root"],
  ["dark", ".dark"],
])("error text in %s mode", (_mode, selector) => {
  const colors = variablesIn(selector);

  it("finds the colours it needs", () => {
    expect(colors.destructive).toMatch(/^#/);
    expect(colors.background).toMatch(/^#/);
    expect(colors.card).toMatch(/^#/);
  });

  // The error boxes, the delete confirmations and the failed status badge paint the destructive colour at
  // 5%, 10% or 20% over the page or a card, and put text of the destructive colour on top.
  it.each([0.05, 0.1, 0.2])("has at least 4.5 to 1 contrast on a %s tint of itself over the page or a card", (opacity) => {
    const text = rgb(colors.destructive);
    for (const under of [colors.background, colors.card]) {
      const background = blend(text, rgb(under), opacity);
      expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
