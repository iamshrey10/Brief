import { describe, expect, it } from "vitest";

import { asTrash, daysLeftText, deletedText, isRunningOut } from "./trash";

const entry = { id: "d1", filename: "a.pdf", doc_type: "lease", deleted_at: "2026-11-03T12:00:00Z", days_left: 5 };

describe("asTrash", () => {
  it("keeps entries shaped like bin documents, and drops the rest", () => {
    expect(asTrash([entry, null, "x", { id: 1 }, { ...entry, days_left: "5" }, { ...entry, days_left: Number.NaN }, { ...entry, deleted_at: undefined }])).toEqual([entry]);
  });

  it("is empty for anything that is not a list", () => {
    expect(asTrash(null)).toEqual([]);
    expect(asTrash({ detail: "no" })).toEqual([]);
  });
});

describe("daysLeftText", () => {
  it.each([
    [7, "7 days left"],
    [2, "2 days left"],
    [1, "Last day"],
    [0, "Removing soon"],
    [-3, "Removing soon"],
  ])("says %i as %s", (days, text) => {
    expect(daysLeftText(days)).toBe(text);
  });

  it("says a document is running out on its last day and after, and not before", () => {
    expect([7, 2, 1, 0].map(isRunningOut)).toEqual([false, false, true, true]);
  });
});

describe("deletedText", () => {
  const now = new Date(2026, 10, 3, 15, 0); // November 3, 2026, local time

  it("says today and yesterday in words, and gives the date after that", () => {
    expect(deletedText(new Date(2026, 10, 3, 9, 0).toISOString(), now)).toBe("Deleted today");
    expect(deletedText(new Date(2026, 10, 2, 23, 0).toISOString(), now)).toBe("Deleted yesterday");
    expect(deletedText(new Date(2026, 9, 30, 10, 0).toISOString(), now)).toBe("Deleted Oct 30");
  });

  it("treats a time a little in the future, from a slow clock, as today", () => {
    expect(deletedText(new Date(2026, 10, 3, 18, 0).toISOString(), now)).toBe("Deleted today");
  });

  it("says nothing for a time it cannot read", () => {
    expect(deletedText("not a date", now)).toBe("");
  });
});
