import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FEATURES, LandingFeatures } from "./landing-features";

describe("the what you get section", () => {
  const html = renderToStaticMarkup(<LandingFeatures />);

  it("has the id the top bar jumps to, named by its own heading", () => {
    expect(html).toContain('id="features"');
    expect(html).toContain('aria-labelledby="features-heading"');
    expect(html).toContain('id="features-heading"');
  });

  it("shows every feature, each under its own heading", () => {
    expect(FEATURES).toHaveLength(3);
    for (const feature of FEATURES) {
      expect(html).toContain(feature.title);
      expect(html).toContain(feature.body);
    }
    expect(html.match(/<h3/g)).toHaveLength(FEATURES.length);
  });

  it("gives each feature a different title", () => {
    expect(new Set(FEATURES.map((feature) => feature.title)).size).toBe(FEATURES.length);
  });

  it("uses no em dash and promises nothing about the future", () => {
    const text = FEATURES.map((feature) => `${feature.title} ${feature.body}`).join(" ");

    expect(text).not.toContain("—");
    expect(text.toLowerCase()).not.toMatch(/\b(soon|coming|will be able|planned)\b/);
  });
});
