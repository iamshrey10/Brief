import { describe, expect, it } from "vitest";

import type { SharedDashboard } from "@/lib/sharing";
import { daysAwayText, importantDates, needsAttention } from "./shared-summary";

const NOW = new Date(2026, 10, 3, 12);
const documents: SharedDashboard["documents"] = [
  { id: "a", filename: "maple.pdf", doc_type: "lease", status: "ready", ocr_confidence: null, key_terms: [] },
  { id: "b", filename: "loan.pdf", doc_type: "loan", status: "failed", ocr_confidence: null, key_terms: [] },
  { id: "c", filename: "scan.jpg", doc_type: "other", status: "needs_retake", ocr_confidence: null, key_terms: [] },
];
const date = (document_id: string, field: string, label: string, value: string) => ({ document_id, field, label, value });

describe("the important dates", () => {
  it("puts those ahead first, soonest first, then those that passed, most recent first, then loose phrases", () => {
    const items = importantDates(
      {
        documents,
        key_dates: [
          date("a", "lease_start", "Lease starts", "October 1, 2026"),
          date("b", "repayment_start", "Repayments start", "six months after graduation"),
          date("a", "lease_end", "Lease ends", "December 1, 2026"),
          date("c", "effective_date", "Takes effect", "November 13, 2026"),
          date("c", "x", "Earlier", "January 5, 2026"),
        ],
      },
      NOW,
    );

    expect(items.map((item) => item.label)).toEqual(["Takes effect", "Lease ends", "Lease starts", "Earlier", "Repayments start"]);
    expect(items.map((item) => item.days)).toEqual([10, 28, -33, -302, null]);
    expect(items[0]).toMatchObject({ filename: "scan.jpg", value: "November 13, 2026" });
  });

  it("leaves out a date whose document is not there, and is empty with no dates", () => {
    expect(importantDates({ documents, key_dates: [date("zzz", "lease_end", "Lease ends", "December 1, 2026")] }, NOW)).toEqual([]);
    expect(importantDates({ documents, key_dates: [] }, NOW)).toEqual([]);
  });

  it.each([
    [0, "Today"],
    [1, "Tomorrow"],
    [-1, "Yesterday"],
    [10, "In 10 days"],
    [-4, "4 days ago"],
    [null, null],
  ])("%s days away reads %s", (days, text) => expect(daysAwayText(days)).toBe(text));
});

describe("what needs attention", () => {
  it("lists a document that could not be read, one that is hard to read, and questions still open", () => {
    const items = needsAttention(documents, [
      { document_id: "a", terms_found: 4, terms_total: 6, questions_answered: 3, open_count: 2, open_questions: [] },
      { document_id: "b", terms_found: null, terms_total: null, questions_answered: null, open_count: 1, open_questions: [] },
    ]);

    expect(items.map((item) => [item.filename, item.what])).toEqual([
      ["maple.pdf", "2 things still to ask"],
      ["loan.pdf", "Could not be read"],
      ["loan.pdf", "1 thing still to ask"],
      ["scan.jpg", "Hard to read, a clearer copy is needed"],
    ]);
  });

  it("is empty when everything is settled", () => {
    expect(needsAttention([documents[0]], [])).toEqual([]);
  });
});
