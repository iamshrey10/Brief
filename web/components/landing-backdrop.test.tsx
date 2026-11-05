import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FEATURES_WORDS, HERO_WORDS, HOW_WORDS, LandingBackdrop } from "./landing-backdrop";

describe("the landing page backdrop", () => {
  const html = renderToStaticMarkup(<LandingBackdrop words={HERO_WORDS} />);

  it("is decoration only: hidden from a screen reader, not clickable and not selectable", () => {
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("pointer-events-none");
    expect(html).toContain("select-none");
  });

  it("sits inside its own screen, behind the content, and does not follow the scroll", () => {
    expect(html).toContain("absolute inset-0");
    expect(html).toContain("-z-10");
    expect(html).not.toContain("fixed");
  });

  it("has a good number of large contract words on each screen, one of them highlighted like the illustration", () => {
    expect(HERO_WORDS.length).toBeGreaterThanOrEqual(12);
    expect(FEATURES_WORDS.length).toBeGreaterThanOrEqual(10);
    expect(HOW_WORDS.length).toBeGreaterThanOrEqual(10);
    for (const words of [HERO_WORDS, FEATURES_WORDS, HOW_WORDS]) {
      expect(words.filter((word) => word.marked)).toHaveLength(1);
      expect(renderToStaticMarkup(<LandingBackdrop words={words} />).match(/bg-amber-300\/25/g)).toHaveLength(1);
    }
    expect(html).toContain('data-word="security deposit"');
  });

  it("draws the words from an attribute, so they are not text on the page", () => {
    expect(html).not.toMatch(/>security deposit</);
    expect(html).toContain("before:content-[attr(data-word)]");
  });

  it("is very faint", () => {
    expect(html).toContain("text-foreground/[0.07]");
  });
});
