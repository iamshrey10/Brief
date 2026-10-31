import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { InsightFromApi } from "@/lib/dashboard";
import { DocumentAnalysis } from "./document-analysis";

const insight = (over: Partial<InsightFromApi> = {}): InsightFromApi => ({
  document_id: "d1", terms_found: 9, terms_total: 12, questions_answered: 7, open_count: 2, open_questions: [], ...over,
});
const documents = [{ id: "d1", filename: "maple-lease.pdf" }, { id: "d2", filename: "loan.pdf" }];
// React puts a comment between a number and the words after it, which a reader never sees.
const render = (insights: InsightFromApi[]) => renderToStaticMarkup(<DocumentAnalysis insights={insights} documents={documents} />).replaceAll("<!-- -->", "");

describe("the what Brief found list", () => {
  it("shows the terms found, the questions answered and the ones open, for each document read", () => {
    const html = render([insight()]);

    expect(html).toContain("maple-lease.pdf");
    expect(html).toContain("9 of 12 terms");
    expect(html).toContain("7 answered");
    expect(html).toContain("2 open");
    expect(html).toContain('href="/dashboard/documents/d1"');
  });

  it("gives the terms bar a name and its numbers, and fills it to the share found", () => {
    const html = render([insight({ terms_found: 6, terms_total: 12 })]);

    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="6"');
    expect(html).toContain('aria-valuemax="12"');
    expect(html).toContain("width:50%");
  });

  it("says nothing is open, in words, when everything is answered", () => {
    expect(render([insight({ open_count: 0 })])).toContain("nothing open");
  });

  it("leaves out a part that was never read, instead of showing a zero", () => {
    const html = render([insight({ questions_answered: null, open_count: null })]);

    expect(html).toContain("terms");
    expect(html).not.toContain("answered");
    expect(html).not.toContain("open");
    expect(render([insight({ terms_found: null, terms_total: null })])).not.toContain("progressbar");
  });

  it("leaves out a document that is no longer in the list, and shows nothing when there is nothing to show", () => {
    expect(render([insight({ document_id: "gone" })])).toBe("");
    expect(render([])).toBe("");
  });

  it("does not divide by zero when there are no terms to find", () => {
    expect(render([insight({ terms_found: 0, terms_total: 0 })])).toContain("width:0%");
  });
});
