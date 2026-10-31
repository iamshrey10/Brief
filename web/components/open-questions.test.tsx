import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { OpenQuestionGroup } from "@/lib/dashboard";
import { OpenQuestions } from "./open-questions";

const group = (over: Partial<OpenQuestionGroup> = {}): OpenQuestionGroup => ({ documentId: "d1", filename: "maple-lease.pdf", total: 2, questions: ["Does it renew automatically?", "Can the rent go up?"], ...over });

describe("the still to ask list", () => {
  it("shows each document's open questions under its name, linking to the document", () => {
    const html = renderToStaticMarkup(<OpenQuestions groups={[group(), group({ documentId: "d2", filename: "offer.pdf", total: 1, questions: ["Is there a signing bonus?"] })]} />);

    expect(html).toContain('href="/dashboard/documents/d1"');
    expect(html).toContain("maple-lease.pdf");
    expect(html).toContain("Does it renew automatically?");
    expect(html).toContain("Is there a signing bonus?");
    expect(html).toContain("3 questions your documents leave open");
  });

  it("uses the singular for one question in one document", () => {
    expect(renderToStaticMarkup(<OpenQuestions groups={[group({ total: 1, questions: ["Only one?"] })]} />)).toContain("1 question your document leaves open");
  });

  it("says how many more there are in the document when only the first few are named", () => {
    const html = renderToStaticMarkup(<OpenQuestions groups={[group({ total: 7, questions: ["A?", "B?"] })]} />);

    expect(html).toContain("and 5 more in the document");
    expect(html).toContain("7 questions");
  });

  it("is named by its heading, and shows nothing when none are open", () => {
    expect(renderToStaticMarkup(<OpenQuestions groups={[group()]} />)).toContain('aria-labelledby="still-to-ask-heading"');
    expect(renderToStaticMarkup(<OpenQuestions groups={[]} />)).toBe("");
  });
});
