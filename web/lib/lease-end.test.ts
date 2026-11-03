import { describe, expect, it } from "vitest";

import { asKeyDates, nextLeaseEnd } from "./lease-end";

const NOW = new Date(2026, 10, 3, 12);
const docs = [
  { id: "a", filename: "maple.pdf" },
  { id: "b", filename: "oak.pdf" },
];
const end = (document_id: string, value: string) => ({ document_id, field: "lease_end", value });

describe("the lease that ends next", () => {
  it("counts the days to the nearest end date that has not passed", () => {
    expect(nextLeaseEnd([end("a", "December 1, 2026"), end("b", "November 13, 2026")], docs, NOW)).toEqual({
      documentId: "b",
      filename: "oak.pdf",
      value: "November 13, 2026",
      days: 10,
    });
  });

  it("is today when it ends today", () => {
    expect(nextLeaseEnd([end("a", "November 3, 2026")], docs, NOW)?.days).toBe(0);
  });

  it("ignores dates that are not lease ends, loose phrases, and documents that are gone", () => {
    expect(
      nextLeaseEnd(
        [{ document_id: "a", field: "lease_start", value: "December 1, 2026" }, end("a", "6 months after move-in"), end("zzz", "December 1, 2026")],
        docs,
        NOW,
      ),
    ).toBeNull();
  });

  it("shows the lease that ended most recently when every lease is over", () => {
    expect(nextLeaseEnd([end("a", "October 1, 2026"), end("b", "October 30, 2026")], docs, NOW)?.days).toBe(-4);
  });

  it("prefers one still running over one that ended", () => {
    expect(nextLeaseEnd([end("a", "October 30, 2026"), end("b", "March 9, 2027")], docs, NOW)?.documentId).toBe("b");
  });

  it("is nothing when no dates were found", () => {
    expect(nextLeaseEnd([], docs, NOW)).toBeNull();
  });
});

describe("reading the key dates from the backend", () => {
  it("keeps well-formed entries and drops the rest", () => {
    expect(asKeyDates([end("a", "x"), { document_id: 1, field: "lease_end", value: "y" }, null, "z"])).toEqual([end("a", "x")]);
  });

  it("is empty for anything that is not a list", () => {
    expect(asKeyDates(null)).toEqual([]);
    expect(asKeyDates({ detail: "x" })).toEqual([]);
  });
});
