import { describe, expect, it } from "vitest";

import { documentFacts } from "./document-facts";

const NOW = new Date("2026-10-30T12:00:00Z");

describe("documentFacts", () => {
  it("counts the clauses and the distinct pages they sit on, and says when it was uploaded", () => {
    const facts = documentFacts([{ page_number: 1 }, { page_number: 1 }, { page_number: 2 }], "2026-10-01T12:00:00Z", NOW);

    expect(facts.slice(0, 2)).toEqual([
      { label: "clauses", value: "3" },
      { label: "pages", value: "2" },
    ]);
    expect(facts[2].label).toBe("uploaded");
    expect(facts[2].value).toBeTruthy();
  });

  it("uses the singular for one clause on one page", () => {
    expect(documentFacts([{ page_number: 4 }], null, NOW)).toEqual([
      { label: "clause", value: "1" },
      { label: "page", value: "1" },
    ]);
  });

  it("leaves out the counts when nothing was read, and the date when there is none", () => {
    expect(documentFacts([], null, NOW)).toEqual([]);
  });
});
