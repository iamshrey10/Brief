import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PORTFOLIO_URL, SiteFooter } from "./site-footer";

describe("the landing page footer", () => {
  const html = renderToStaticMarkup(<SiteFooter />);

  it("links to the privacy and terms pages", () => {
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
  });

  it("links to the portfolio, in a new tab that cannot reach back into this one", () => {
    expect(html).toContain(`href="${PORTFOLIO_URL}"`);
    expect(html).toContain("SHREYASREVANKAR.COM");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("no longer links to the source on GitHub", () => {
    expect(html).not.toContain("github.com");
    expect(html).not.toContain("Source on GitHub");
  });

  it("does not put the email address in the page text, where a bot that collects addresses would find it", () => {
    expect(html).not.toContain("revankarshreyas10");
    expect(html).not.toContain("mailto:");
  });

  it("says Brief is explanation and not legal advice", () => {
    expect(html).toContain("explanation, not legal advice");
  });

  it("names the legal links as a navigation landmark", () => {
    expect(html).toContain('aria-label="Legal"');
  });
});
