import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import TermsPage, { metadata } from "./page";

const html = () => renderToStaticMarkup(<TermsPage />);

describe("the terms page", () => {
  it("has a title for the tab", () => {
    expect(metadata.title).toBe("Terms");
  });

  it("says Brief is not a lawyer and never says whether to sign", () => {
    expect(html()).toContain("does not give");
    expect(html()).toContain("never tells you whether to sign");
  });

  it("states the limits the service really applies", () => {
    expect(html()).toContain("25 documents");
    expect(html()).toContain("50 MB and 100 pages");
  });

  it("says plainly that it is a personal project with no warranty", () => {
    expect(html()).toContain("personal project");
    expect(html()).toContain("no warranty");
  });

  it("uses no em dash", () => {
    expect(html()).not.toContain("—");
  });
});
