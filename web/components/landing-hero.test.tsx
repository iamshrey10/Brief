import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ signIn: vi.fn(), signOut: vi.fn() }));

import { HERO_PROMISES, LandingHero } from "./landing-hero";

describe("the landing page hero", () => {
  it("has one heading, and it is the tagline", () => {
    const html = renderToStaticMarkup(<LandingHero signedIn={false} />);

    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>Every clause, explained\.<\/h1>/);
  });

  it("offers Sign in with Google to someone who is not signed in, and no dashboard link", () => {
    const html = renderToStaticMarkup(<LandingHero signedIn={false} />);

    expect(html).toContain("Sign in with Google");
    expect(html).not.toContain("Go to dashboard");
  });

  it("offers the dashboard to someone who is signed in, and no sign in", () => {
    const html = renderToStaticMarkup(<LandingHero signedIn />);

    expect(html).toContain('href="/dashboard"');
    expect(html).toContain("Go to dashboard");
    expect(html).not.toContain("Sign in with Google");
  });

  it("lists each promise, and hides the check marks from a screen reader", () => {
    const html = renderToStaticMarkup(<LandingHero signedIn={false} />);

    for (const promise of HERO_PROMISES) expect(html).toContain(promise);
    expect(html.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(HERO_PROMISES.length);
  });

  it("keeps every promise short enough to read at a glance and free of em dashes", () => {
    for (const promise of HERO_PROMISES) {
      expect(promise.length).toBeLessThan(60);
      expect(promise).not.toContain("—");
    }
  });

  it("shows the Google G inside the Sign in with Google button, as a decoration", () => {
    const html = renderToStaticMarkup(<LandingHero signedIn={false} />);
    const button = html.slice(html.indexOf("<button"), html.indexOf("</button>"));

    expect(button).toContain('fill="#4285F4"');
    expect(button).toContain('aria-hidden="true"');
    expect(button).toContain("Sign in with Google");
  });

  it("has a See how it works button that jumps to the How it works section", () => {
    const html = renderToStaticMarkup(<LandingHero signedIn={false} />);

    expect(html).toMatch(/href="#how"[^>]*>.*See how it works</);
    expect(html).not.toContain("min-h-[calc(100svh");
  });
});
