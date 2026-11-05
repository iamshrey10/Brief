import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CELLS, LandingBackdrop } from "./landing-backdrop";

describe("the landing page backdrop", () => {
  const html = renderToStaticMarkup(<LandingBackdrop />);

  it("is decoration only: hidden from a screen reader, not clickable and not selectable", () => {
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("pointer-events-none");
    expect(html).toContain("select-none");
  });

  it("is fixed to the window, so it stays while the page scrolls over it, and sits behind the content", () => {
    expect(html).toContain("fixed inset-0");
    expect(html).toContain("-z-10");
  });

  it("is many small contract words, one of them highlighted like the illustration", () => {
    expect(CELLS.length).toBeGreaterThan(40);
    expect(html).toContain('data-word="security deposit"');
    expect(html.match(/bg-amber-300\/30/g)).toHaveLength(1);
    expect(html).not.toContain("text-5xl");
    expect(html).not.toContain("text-7xl");
  });

  it("draws the words from an attribute, so they are not text on the page", () => {
    expect(html).not.toMatch(/>security deposit</);
    expect(html).toContain("before:content-[attr(data-word)]");
  });

  it("is faint but a little brighter than the first version, and is the same picture every time", () => {
    expect(html).toContain("text-foreground/[0.09]");
    expect(renderToStaticMarkup(<LandingBackdrop />)).toBe(html);
  });
});
