import { describe, expect, it } from "vitest";

import { countByKind, summaryLine } from "./document-summary";

const doc = (doc_type: string) => ({ doc_type });

describe("countByKind", () => {
  it("counts each kind, in the order the kinds are listed, and leaves out kinds with none", () => {
    const counts = countByKind([doc("offer"), doc("lease"), doc("lease")]);

    expect(counts).toEqual([
      { kind: "lease", label: "Lease", count: 2 },
      { kind: "offer", label: "Job offer", count: 1 },
    ]);
  });

  it("counts a kind it does not know after the known ones, under its own name", () => {
    expect(countByKind([doc("passport"), doc("loan")]).map((entry) => [entry.label, entry.count])).toEqual([
      ["Education loan", 1],
      ["passport", 1],
    ]);
  });

  it("is empty for no documents", () => {
    expect(countByKind([])).toEqual([]);
  });
});

describe("summaryLine", () => {
  it("says there are none yet", () => {
    expect(summaryLine([])).toBe("No documents yet");
  });

  it("says one document in the singular", () => {
    expect(summaryLine([doc("lease")])).toBe("1 document: 1 lease");
  });

  it("says how many there are in all and of each kind", () => {
    expect(summaryLine([doc("loan"), doc("lease"), doc("lease")])).toBe("3 documents: 1 education loan, 2 lease");
  });

  it("uses no em dash", () => {
    expect(summaryLine([doc("lease"), doc("offer")])).not.toContain("—");
  });
});
