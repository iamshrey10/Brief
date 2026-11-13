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

  it("is dated today", () => {
    expect(html()).toContain("Last updated November 12, 2026");
  });

  it("says who runs it", () => {
    expect(html()).toContain("Shreyas Revankar");
  });

  it("states the daily limits and the whole-site cap", () => {
    expect(html()).toContain("today 40, 10 and 20");
    expect(html()).toContain("busy until tomorrow");
  });

  it("asks for fair use, including no extra accounts to get around the limits", () => {
    expect(html()).toContain("Using Brief fairly");
    expect(html()).toContain("including by making extra accounts");
    expect(html()).toContain("overload the service");
  });

  it("covers sharing: who to trust, how long, and that the person is responsible", () => {
    expect(html()).toContain("Sharing your dashboard");
    expect(html()).toContain("up to 90 days");
    expect(html()).toContain("You are");
  });

  it("says terms can change and an account that breaks them can be removed", () => {
    expect(html()).toContain("Changes to these terms");
    expect(html()).toContain("suspended or removed");
  });

  it("names the file types, and that a blurry photo may be refused", () => {
    expect(html()).toContain("PDF, JPG, PNG or HEIC");
    expect(html()).toContain("too");
    expect(html()).toContain("blurry");
  });

  it("does not print the email address in the page text", () => {
    expect(html()).not.toContain("revankarshreyas10");
  });
});
