import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import PrivacyPage, { metadata } from "./page";

const html = () => renderToStaticMarkup(<PrivacyPage />);

describe("the privacy page", () => {
  it("has a title for the tab", () => {
    expect(metadata.title).toBe("Privacy");
  });

  it("says what is kept, including the limit on traces and that questions are not saved", () => {
    expect(html()).toContain("up to 30 days");
    expect(html()).toContain("are not saved by Brief");
    expect(html()).toContain("email address");
  });

  it("says plainly that the text goes to Google's Gemini service", () => {
    expect(html()).toContain("Gemini");
    expect(html()).toContain("clauses, and your question");
  });

  it("says how to remove data, and that it is not legal advice", () => {
    expect(html()).toContain("Deleting your account");
    expect(html()).toContain("cannot be undone");
    expect(html()).toContain("does not give legal advice");
  });

  it("uses no em dash", () => {
    expect(html()).not.toContain("—");
  });
});
