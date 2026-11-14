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

  it("says what the owner sees, that it can be saved as a report, and how the demo video is counted without anyone identified", () => {
    expect(html()).toContain("daily or monthly report");
    expect(html()).toContain("watched to the end");
    expect(html()).toContain("without a cookie or an address");
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

  it("is dated today", () => {
    expect(html()).toContain("Last updated November 14, 2026");
  });

  it("names every service that handles the data, and says where", () => {
    for (const company of ["Google", "Cloudflare", "Neon", "Render", "Vercel", "Upstash"]) expect(html()).toContain(`<strong>${company}</strong>`);
    expect(html()).toContain("United");
    expect(html()).toContain("North America");
    expect(html()).toContain("does not sell data");
  });

  it("lists what was missing before: the name, why you came, time in Brief, shares and two-step data", () => {
    expect(html()).toContain("first and last name");
    expect(html()).toContain("Why you said you came");
    expect(html()).toContain("How long Brief is open and in use");
    expect(html()).toContain("If you share your dashboard");
    expect(html()).toContain("two-step verification");
  });

  it("says a deleted document waits in the Bin for 7 days, which the old page left out", () => {
    expect(html()).toContain("Bin");
    expect(html()).toContain("7 days");
    expect(html()).toContain("removed after an hour");
  });

  it("explains sharing, and what the owner of Brief can and cannot see", () => {
    expect(html()).toContain("When you share your dashboard");
    expect(html()).toContain("up to 90 days");
    expect(html()).toContain("What the owner of Brief can see");
    expect(html()).toContain("does not show anyone&#x27;s name or email address");
  });

  it("mentions the browser cookie for a trusted device, that there are no advertising cookies, and the optional visit counting", () => {
    expect(html()).toContain("30 days");
    expect(html()).toContain("no advertising cookies");
    expect(html()).toContain("Google Analytics");
    expect(html()).toContain("only if you say yes");
  });

  it("gives an email way to ask, and no longer points to GitHub", () => {
    expect(html()).toContain("write to");
    expect(html()).not.toContain("github.com");
  });

  it("does not print the email address in the page text, where a bot that collects addresses would find it", () => {
    expect(html()).not.toContain("revankarshreyas10");
  });
});
