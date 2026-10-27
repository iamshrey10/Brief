import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ signIn: vi.fn(), signOut: vi.fn() }));

import { SECTION_LINKS, SiteHeader } from "./site-header";

describe("the landing page header", () => {
  it("shows the name as a link home, whoever is looking", () => {
    for (const signedIn of [true, false]) {
      const html = renderToStaticMarkup(<SiteHeader signedIn={signedIn} />);

      expect(html).toContain('href="/"');
      expect(html).toMatch(/Brief(<!-- -->)?<span class="text-primary">\.<\/span>/);
    }
  });

  it("offers Sign in, and no dashboard or Sign out, to someone who is not signed in", () => {
    const html = renderToStaticMarkup(<SiteHeader signedIn={false} />);

    expect(html).toContain("Sign in");
    expect(html).not.toContain("Dashboard");
    expect(html).not.toContain("Sign out");
  });

  it("offers the dashboard and Sign out, and no Sign in, to someone who is signed in", () => {
    const html = renderToStaticMarkup(<SiteHeader signedIn />);

    expect(html).toContain('href="/dashboard"');
    expect(html).toContain("Sign out");
    expect(html).not.toContain(">Sign in<");
  });

  it("keeps the theme button in the bar", () => {
    expect(renderToStaticMarkup(<SiteHeader signedIn={false} />)).toContain("h-9 w-24");
  });

  it("links to each section of the page by its id, in the order they appear", () => {
    const html = renderToStaticMarkup(<SiteHeader signedIn={false} />);

    expect(SECTION_LINKS.map((link) => link.href)).toEqual(["#features", "#how"]);
    for (const link of SECTION_LINKS) expect(html).toMatch(new RegExp(`href="${link.href}"[^>]*>${link.label}<`));
    expect(html.indexOf('href="#features"')).toBeLessThan(html.indexOf('href="#how"'));
  });

  it("hides the section links on a phone, where there is no room, and names them as a landmark", () => {
    const html = renderToStaticMarkup(<SiteHeader signedIn={false} />);

    expect(html).toContain('aria-label="Sections"');
    expect(html).toMatch(/<nav[^>]*class="hidden[^"]*md:flex"/);
  });
});
