import { describe, expect, it } from "vitest";

import { asDocuments, documentStats, formatAgo, recentActivity } from "./dashboard";

const status = (value: string) => ({ status: value });

describe("documentStats", () => {
  it("counts the documents ready, needing attention and being read, out of the total", () => {
    const stats = documentStats([
      status("ready"),
      status("ready"),
      status("failed"),
      status("needs_retake"),
      status("processing"),
      status("uploaded"),
      status("pending"),
    ]);

    expect(stats).toEqual({ total: 7, ready: 2, needsAttention: 2, reading: 3 });
  });

  it("is all zeros for no documents", () => {
    expect(documentStats([])).toEqual({ total: 0, ready: 0, needsAttention: 0, reading: 0 });
  });

  it("counts a status it does not know in the total only, rather than guessing", () => {
    expect(documentStats([status("mystery")])).toEqual({ total: 1, ready: 0, needsAttention: 0, reading: 0 });
  });
});

describe("asDocuments", () => {
  const good = { id: "d1", filename: "a.pdf", doc_type: "lease", status: "ready", ocr_confidence: null };

  it("keeps entries shaped like documents, and drops the rest", () => {
    expect(asDocuments([good, null, "x", { id: 1 }, { ...good, status: undefined }])).toEqual([good]);
  });

  it("is empty for anything that is not a list", () => {
    expect(asDocuments(null)).toEqual([]);
    expect(asDocuments({ detail: "no" })).toEqual([]);
  });
});

const NOW = new Date("2026-10-30T12:00:00Z");

describe("formatAgo", () => {
  it.each([
    ["2026-10-30T11:59:40Z", "just now"],
    ["2026-10-30T11:59:00Z", "1 minute ago"],
    ["2026-10-30T11:15:00Z", "45 minutes ago"],
    ["2026-10-30T11:00:00Z", "1 hour ago"],
    ["2026-10-30T03:00:00Z", "9 hours ago"],
    ["2026-10-29T08:00:00Z", "yesterday"],
    ["2026-10-27T12:00:00Z", "3 days ago"],
  ])("says %s as %s", (iso, expected) => {
    expect(formatAgo(iso, NOW)).toBe(expected);
  });

  it("gives the date once it is a week old, with the year only when it is another year", () => {
    // Which day it is depends on the time zone of whoever looks, so the test checks the shape and not one exact day.
    expect(formatAgo("2026-10-01T12:00:00Z", NOW)).toMatch(/^Oct \d{1,2}$/);
    expect(formatAgo("2025-03-05T12:00:00Z", NOW)).toMatch(/2025/);
  });

  it("says nothing when there is no usable time", () => {
    expect(formatAgo(null, NOW)).toBe("");
    expect(formatAgo(undefined, NOW)).toBe("");
    expect(formatAgo("not a date", NOW)).toBe("");
  });
});

describe("recentActivity", () => {
  const document = (id: string, status: string, changed: string | null, created = "2026-10-01T00:00:00Z") => ({
    id,
    filename: `${id}.pdf`,
    doc_type: "lease",
    status,
    ocr_confidence: null,
    created_at: created,
    status_changed_at: changed,
  });

  it("lists the most recent first, saying what each is like now and how long ago that was", () => {
    const items = recentActivity(
      [document("old", "ready", "2026-10-02T12:00:00Z"), document("new", "failed", "2026-10-30T11:00:00Z"), document("mid", "processing", "2026-10-29T08:00:00Z")],
      NOW,
    );

    expect(items.map((item) => [item.id, item.what])).toEqual([
      ["new", "Could not be read"],
      ["mid", "Being read"],
      ["old", "Ready to open"],
    ]);
    expect(items.map((item) => item.when.replace(/ \d{1,2}$/, " D"))).toEqual(["1 hour ago", "yesterday", "Oct D"]);
  });

  it("uses the upload time when a document has no status change time, and keeps the list short", () => {
    const many = Array.from({ length: 8 }, (_, i) => document(`d${i}`, "ready", null, `2026-10-${10 + i}T00:00:00Z`));

    const items = recentActivity(many, NOW);

    expect(items).toHaveLength(5);
    expect(items[0].id).toBe("d7");
  });

  it("opens only a document that has text to show", () => {
    const items = recentActivity([document("a", "ready", "2026-10-30T11:00:00Z"), document("b", "failed", "2026-10-30T10:00:00Z"), document("c", "needs_retake", "2026-10-30T09:00:00Z")], NOW);

    expect(items.map((item) => item.openable)).toEqual([true, false, true]);
  });

  it("names a status it does not know as it is, and handles no documents", () => {
    expect(recentActivity([document("x", "mystery", "2026-10-30T11:00:00Z")], NOW)[0].what).toBe("mystery");
    expect(recentActivity([], NOW)).toEqual([]);
  });
});
