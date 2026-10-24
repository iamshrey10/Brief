import { describe, expect, it } from "vitest";

import { DESCRIPTION, siteMetadata } from "./site-metadata";

describe("siteMetadata", () => {
  it("names the site and says what it does in the default title and description", () => {
    expect(siteMetadata.title).toMatchObject({ default: "Brief: Every clause, explained.", template: "%s | Brief" });
    expect(siteMetadata.description).toBe(DESCRIPTION);
    expect(DESCRIPTION).toContain("exact words behind every answer");
  });

  it("gives a shared link the same title and description as the page", () => {
    expect(siteMetadata.openGraph).toMatchObject({ type: "website", siteName: "Brief", description: DESCRIPTION });
    expect(siteMetadata.twitter).toMatchObject({ card: "summary", description: DESCRIPTION });
  });

  it("keeps the description a sensible length for a search result", () => {
    expect(DESCRIPTION.length).toBeGreaterThan(60);
    expect(DESCRIPTION.length).toBeLessThanOrEqual(200);
  });

  it("uses no em dash", () => {
    expect(JSON.stringify(siteMetadata)).not.toContain("—");
  });
});
