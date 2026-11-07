import { describe, expect, it } from "vitest";

import type { DocumentSummary } from "@/lib/documents";
import { stepOf, stepProgress, stepText, type TrackedDocument } from "@/lib/tracking";

const tracked = (status: string, prepared = false, extra: Partial<DocumentSummary> = {}): TrackedDocument => ({
  document: { id: "d", filename: "d.pdf", doc_type: "lease", status, ocr_confidence: null, ...extra },
  prepared,
});

describe("stepOf", () => {
  it("follows the document from being sent to being ready to open", () => {
    expect(stepOf(tracked("pending"))).toBe(0);
    expect(stepOf(tracked("uploaded"))).toBe(1);
    expect(stepOf(tracked("processing"))).toBe(1);
    expect(stepOf(tracked("ready"))).toBe(2);
    expect(stepOf(tracked("needs_retake"))).toBe(2);
    expect(stepOf(tracked("ready", true))).toBe(3);
  });
});

describe("stepText", () => {
  it("says what is happening in plain words, with the part when it is known", () => {
    expect(stepText(tracked("pending"))).toBe("Sending your file");
    expect(stepText(tracked("uploaded"))).toBe("Reading the document");
    expect(stepText(tracked("processing", false, { progress_done: 3, progress_total: 10 }))).toBe("Reading part 3 of 10");
    expect(stepText(tracked("processing", false, { progress_done: 99, progress_total: 10 }))).toBe("Reading part 10 of 10");
    expect(stepText(tracked("processing", false, { progress_total: 0 }))).toBe("Reading the document");
    expect(stepText(tracked("ready"))).toBe("Finding the key terms and the questions to ask");
    expect(stepText(tracked("ready", true))).toBe("Ready to open");
  });
});

describe("stepProgress", () => {
  it("is how far the reading has got, and unknown when it has not been counted", () => {
    expect(stepProgress(tracked("processing", false, { progress_done: 3, progress_total: 10 }))).toBeCloseTo(0.3);
    expect(stepProgress(tracked("processing", false, { progress_done: 20, progress_total: 10 }))).toBe(1);
    expect(stepProgress(tracked("processing", false, { progress_done: -2, progress_total: 10 }))).toBe(0);
    expect(stepProgress(tracked("processing"))).toBeNull();
    expect(stepProgress(tracked("uploaded", false, { progress_total: 10 }))).toBeNull();
    expect(stepProgress(tracked("ready"))).toBeNull();
  });
});
