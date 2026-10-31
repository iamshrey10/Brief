import { describe, expect, it } from "vitest";

import { asDocuments, documentStats } from "./dashboard";

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
