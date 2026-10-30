import { describe, expect, it } from "vitest";

import { DOC_TYPE_LABELS } from "./documents";
import { SUGGESTED_QUESTIONS, suggestionsFor } from "./suggested-questions";

describe("suggested questions", () => {
  it("has three for every kind of document the site knows", () => {
    for (const kind of Object.keys(DOC_TYPE_LABELS)) expect(SUGGESTED_QUESTIONS[kind]).toHaveLength(3);
  });

  it("gives the general ones for a kind it does not know, or none given", () => {
    expect(suggestionsFor("passport")).toEqual(SUGGESTED_QUESTIONS.other);
    expect(suggestionsFor(undefined)).toEqual(SUGGESTED_QUESTIONS.other);
  });

  it("gives the lease ones for a lease", () => {
    expect(suggestionsFor("lease")[0]).toContain("security deposit");
  });

  it("keeps every question short, ending in a question mark, with no em dash", () => {
    for (const question of Object.values(SUGGESTED_QUESTIONS).flat()) {
      expect(question.length).toBeLessThanOrEqual(70);
      expect(question.endsWith("?")).toBe(true);
      expect(question).not.toContain("—");
    }
  });
});
