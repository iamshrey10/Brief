import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ signIn: vi.fn(), signOut: vi.fn() }));

import { APP_SECTIONS, AppHeader } from "./app-header";

describe("the signed in header", () => {
  it("shows the name as a link to the dashboard, not the landing page", () => {
    const html = renderToStaticMarkup(<AppHeader email="reader@example.com" current="documents" />);

    expect(html).toMatch(/href="\/dashboard"[^>]*>Brief/);
  });

  it("shows a small Back beside the name only when the page has somewhere to go back to", () => {
    const without = renderToStaticMarkup(<AppHeader email="reader@example.com" current="documents" />);
    const withBack = renderToStaticMarkup(
      <AppHeader email="reader@example.com" current="documents" back={{ href: "/dashboard/documents", label: "Back to your documents" }} />,
    );

    expect(without).not.toContain("Back");
    expect(withBack).toContain('href="/dashboard/documents"');
    expect(withBack).toContain('aria-label="Back to your documents"');
    expect(withBack).toContain(">Back</span>");
  });

  it("shows who is signed in, in full as a tooltip for an address too long to fit", () => {
    const html = renderToStaticMarkup(<AppHeader email="a.very.long.address@example.com" current="documents" />);

    expect(html).toContain('title="a.very.long.address@example.com"');
    expect(html).toContain(">a.very.long.address@example.com<");
  });

  it("hides the address on a phone, where there is no room, but keeps Sign out and the theme button", () => {
    const html = renderToStaticMarkup(<AppHeader email="reader@example.com" current="documents" />);

    expect(html).toMatch(/<p class="hidden[^"]*md:block"/);
    expect(html).toContain("Sign out");
    expect(html).toContain("h-9 w-24");
  });

  it("takes its width from the page, so the bar lines up with the content under it", () => {
    expect(renderToStaticMarkup(<AppHeader email="a@b.co" current="documents" />)).toContain("min(100%-3rem,1400px)");
    expect(renderToStaticMarkup(<AppHeader email="a@b.co" current="documents" widthClass="max-w-6xl" />)).toContain("max-w-6xl");
  });

  it("links to the Dashboard, Documents, Shared and Profile sections, in that order", () => {
    const html = renderToStaticMarkup(<AppHeader email="a@b.co" current="documents" />);

    expect(APP_SECTIONS.map((section) => section.href)).toEqual(["/dashboard", "/dashboard/documents", "/dashboard/shared", "/dashboard/profile"]);
    expect(html.indexOf(">Dashboard<")).toBeLessThan(html.indexOf(">Documents<"));
    expect(html.indexOf(">Documents<")).toBeLessThan(html.indexOf(">Shared<"));
    expect(html.indexOf(">Shared<")).toBeLessThan(html.indexOf(">Profile<"));
  });

  it("marks only the current section, for assistive technology and by color", () => {
    for (const [current, other] of [["documents", "Profile"], ["profile", "Documents"]] as const) {
      const html = renderToStaticMarkup(<AppHeader email="a@b.co" current={current} />);
      const marked = html.match(/aria-current="page"[^>]*>([^<]+)</g) ?? [];

      expect(marked.length).toBeGreaterThan(0);
      for (const link of marked) expect(link).not.toContain(other);
    }
  });

  it("shows the sections beside the name on a wide screen and in a bar fixed to the bottom on a phone", () => {
    const html = renderToStaticMarkup(<AppHeader email="a@b.co" current="documents" />);

    expect(html).toMatch(/<nav aria-label="Sections" class="hidden[^"]*sm:flex"/);
    expect(html).toMatch(/<nav aria-label="Sections" class="fixed inset-x-0 bottom-0[^"]*sm:hidden/);
    // The bar across the top no longer carries a second row of sections on a phone: four links in the bar, four beside the name.
    expect(html.match(/<a[^>]*href="\/dashboard(\/[a-z]+)?"/g)).toHaveLength(9);
  });
});
