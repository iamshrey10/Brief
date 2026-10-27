import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { REPOSITORY_URL, SiteFooter } from "./site-footer";

describe("the landing page footer", () => {
  const html = renderToStaticMarkup(<SiteFooter />);

  it("links to the privacy and terms pages", () => {
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
  });

  it("links to the source, in a new tab that cannot reach back into this one", () => {
    expect(html).toContain(`href="${REPOSITORY_URL}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("says Brief is explanation and not legal advice", () => {
    expect(html).toContain("explanation, not legal advice");
  });

  it("names the legal links as a navigation landmark", () => {
    expect(html).toContain('aria-label="Legal"');
  });
});
