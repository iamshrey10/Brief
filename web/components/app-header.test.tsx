import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ signIn: vi.fn(), signOut: vi.fn() }));

import { AppHeader } from "./app-header";

describe("the signed in header", () => {
  it("shows the name as a link to the dashboard, not the landing page", () => {
    const html = renderToStaticMarkup(<AppHeader email="reader@example.com" />);

    expect(html).toMatch(/href="\/dashboard"[^>]*>Brief/);
  });

  it("shows who is signed in, in full as a tooltip for an address too long to fit", () => {
    const html = renderToStaticMarkup(<AppHeader email="a.very.long.address@example.com" />);

    expect(html).toContain('title="a.very.long.address@example.com"');
    expect(html).toContain(">a.very.long.address@example.com<");
  });

  it("hides the address on a phone, where there is no room, but keeps Sign out and the theme button", () => {
    const html = renderToStaticMarkup(<AppHeader email="reader@example.com" />);

    expect(html).toMatch(/<p class="hidden[^"]*sm:block"/);
    expect(html).toContain("Sign out");
    expect(html).toContain("h-9 w-24");
  });

  it("takes its width from the page, so the bar lines up with the content under it", () => {
    expect(renderToStaticMarkup(<AppHeader email="a@b.co" />)).toContain("max-w-4xl");
    expect(renderToStaticMarkup(<AppHeader email="a@b.co" widthClass="max-w-6xl" />)).toContain("max-w-6xl");
  });
});
