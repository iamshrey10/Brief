import { describe, expect, it } from "vitest";

import { countByKind, filterDocuments, sortDocuments, summaryLine } from "./document-summary";

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
    expect(summaryLine([doc("lease")])).toBe("1 document");
  });

  it("says how many there are in the plural, whatever their kinds", () => {
    expect(summaryLine([doc("loan"), doc("lease"), doc("lease")])).toBe("3 documents");
  });
});

describe("filterDocuments", () => {
  const documents = [
    { filename: "Maple Court Lease.pdf", doc_type: "lease" },
    { filename: "student-loan.pdf", doc_type: "loan" },
    { filename: "Old lease scan.jpg", doc_type: "lease" },
  ];

  it("keeps everything when nothing is searched and every kind is shown", () => {
    expect(filterDocuments(documents, "", "all")).toEqual(documents);
    expect(filterDocuments(documents, "   ", "all")).toEqual(documents);
  });

  it("matches part of a name, ignoring case and spaces around the search", () => {
    expect(filterDocuments(documents, "  LEASE ", "all").map((d) => d.filename)).toEqual([
      "Maple Court Lease.pdf",
      "Old lease scan.jpg",
    ]);
  });

  it("keeps only one kind when asked, and combines that with the search", () => {
    expect(filterDocuments(documents, "", "loan").map((d) => d.filename)).toEqual(["student-loan.pdf"]);
    expect(filterDocuments(documents, "maple", "lease").map((d) => d.filename)).toEqual(["Maple Court Lease.pdf"]);
    expect(filterDocuments(documents, "maple", "loan")).toEqual([]);
  });
});

describe("sortDocuments", () => {
  const documents = [
    { filename: "b lease.pdf", created_at: "2026-10-02T00:00:00Z" },
    { filename: "A loan.pdf", created_at: "2026-10-03T00:00:00Z" },
    { filename: "c offer 10.pdf", created_at: null },
    { filename: "c offer 9.pdf", created_at: "2026-10-01T00:00:00Z" },
  ];
  const names = (list: { filename: string }[]) => list.map((d) => d.filename);

  it("puts the newest first, and a document with no date last", () => {
    expect(names(sortDocuments(documents, "newest"))).toEqual(["A loan.pdf", "b lease.pdf", "c offer 9.pdf", "c offer 10.pdf"]);
  });

  it("puts the oldest first, and a document with no date still last", () => {
    expect(names(sortDocuments(documents, "oldest"))).toEqual(["c offer 9.pdf", "b lease.pdf", "A loan.pdf", "c offer 10.pdf"]);
  });

  it("sorts by name ignoring case, with numbers in their natural order", () => {
    expect(names(sortDocuments(documents, "name"))).toEqual(["A loan.pdf", "b lease.pdf", "c offer 9.pdf", "c offer 10.pdf"]);
  });

  it("returns a copy and leaves the list it was given alone", () => {
    const before = names(documents);
    sortDocuments(documents, "name");
    expect(names(documents)).toEqual(before);
  });
});
