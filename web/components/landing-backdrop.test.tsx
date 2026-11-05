import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LandingBackdrop } from "./landing-backdrop";

describe("the landing page backdrop", () => {
  const html = renderToStaticMarkup(<LandingBackdrop />);

  it("is decoration only: hidden from a screen reader, not clickable and not selectable", () => {
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("pointer-events-none");
    expect(html).toContain("select-none");
  });

  it("is made of contract words, one of them highlighted like the illustration", () => {
    for (const word of ["security deposit", "late fee", "notice period", "interest rate", "termination"]) expect(html).toContain(`data-word="${word}"`);
    expect(html.match(/bg-amber-300\/25/g)).toHaveLength(1);
  });

  it("draws the words from an attribute, so they are not text on the page", () => {
    expect(html).not.toMatch(/>security deposit</);
    expect(html).toContain("before:content-[attr(data-word)]");
  });

  it("is very faint, and sits behind the content", () => {
    expect(html).toContain("text-foreground/[0.06]");
    expect(html).toContain("-z-10");
  });
});
