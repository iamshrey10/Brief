import { describe, expect, it } from "vitest";

import type { ChecklistAnswer, KeyTerm } from "./overview";
import { buildSummary } from "./summary-text";

const found = (name: string, label: string, value: string, page = 1): KeyTerm => ({
  name, label, found: true, value, clause_id: "c1", page_number: page, quote: "SECRET QUOTE", evidence: [],
});
const missing = (name: string, label: string): KeyTerm => ({
  name, label, found: false, value: null, clause_id: null, page_number: null, quote: null, evidence: [],
});
const gap = (id: string, ask: string): ChecklistAnswer => ({
  id, question: `Q ${id}`, why_it_matters: "w", importance: "high", status: "not_mentioned", answer: null, evidence: [], gap: true, ask_them: ask,
});

const TERMS = { terms: [found("monthly_rent", "Monthly rent", "$1,650.00", 2), found("late_fee", "Late fee", "$75"), missing("pets", "Pet policy"), missing("utilities", "Utilities")], truncated: false };
const CHECKLIST = { answers: [gap("renewal", "Does it renew automatically?"), gap("increase", "Can the rent go up?")], truncated: false };

describe("buildSummary as text", () => {
  const text = buildSummary("lease", TERMS, CHECKLIST);

  it("is titled for the kind of document, and says it is from Brief", () => {
    expect(text.startsWith("SUMMARY OF MY LEASE, FROM BRIEF\n")).toBe(true);
  });

  it("lists the terms found with their pages, and the ones the document does not mention together", () => {
    expect(text).toContain("* Monthly rent: $1,650.00 (page 2)");
    expect(text).toContain("* Late fee: $75 (page 1)");
    expect(text).toContain("NOT MENTIONED IN THE DOCUMENT\n* Pet policy, Utilities");
  });

  it("numbers the questions to ask, in the wording Brief wrote for them", () => {
    expect(text).toContain("1. Does it renew automatically?\n2. Can the rent go up?");
  });

  it("ends by saying it is not legal advice, and carries no quote from the document", () => {
    expect(text.trimEnd().endsWith("Check everything against the document itself.")).toBe(true);
    expect(text).toContain("not legal advice");
    expect(text).not.toContain("SECRET QUOTE");
  });

  it("uses no em dash", () => {
    expect(text).not.toContain("—");
  });
});

describe("buildSummary as Markdown", () => {
  it("uses headings and dashes", () => {
    const md = buildSummary("loan", TERMS, CHECKLIST, "markdown");

    expect(md.startsWith("# Summary of my education loan, from Brief\n")).toBe(true);
    expect(md).toContain("## Key terms");
    expect(md).toContain("- Monthly rent: $1,650.00 (page 2)");
    expect(md).toContain("## Questions to ask before signing");
  });
});

describe("buildSummary when parts are missing", () => {
  it("leaves out the questions when the checklist did not load", () => {
    expect(buildSummary("lease", TERMS, null)).not.toContain("QUESTIONS TO ASK");
  });

  it("leaves out an empty section instead of showing a bare heading", () => {
    const only = buildSummary("offer", { terms: [found("base_salary", "Base salary", "$120,000")], truncated: false }, { answers: [], truncated: false });

    expect(only).not.toContain("NOT MENTIONED");
    expect(only).not.toContain("QUESTIONS TO ASK");
    expect(only).toContain("* Base salary: $120,000");
  });

  it("says when the document was too long to read in full", () => {
    expect(buildSummary("lease", { ...TERMS, truncated: true }, CHECKLIST)).toContain("too long to read in full");
  });

  it("calls a kind it does not know an agreement", () => {
    expect(buildSummary("passport", TERMS, null)).toContain("SUMMARY OF MY AGREEMENT");
  });
});
