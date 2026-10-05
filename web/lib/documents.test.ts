import { describe, expect, it } from "vitest";
import {
  contentTypeFor,
  formatFileSize,
  formatUploaded,
  groupByPage,
  isInProgress,
  isReadable,
  mergeFresh,
  putFirst,
  statusLabel,
  type ClauseData,
} from "./documents";

function clause(id: string, page: number, index: number): ClauseData {
  return { id, clause_index: index, page_number: page, text: `Clause ${id}` };
}

describe("groupByPage", () => {
  it("returns nothing for no clauses", () => {
    expect(groupByPage([])).toEqual([]);
  });

  it("groups consecutive clauses that share a page", () => {
    const groups = groupByPage([clause("a", 1, 0), clause("b", 1, 1)]);

    expect(groups).toHaveLength(1);
    expect(groups[0].pageNumber).toBe(1);
    expect(groups[0].clauses.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("starts a new group whenever the page changes, keeping reading order", () => {
    const groups = groupByPage([
      clause("a", 1, 0),
      clause("b", 1, 1),
      clause("c", 2, 2),
      clause("d", 3, 3),
      clause("e", 3, 4),
    ]);

    expect(groups.map((g) => g.pageNumber)).toEqual([1, 2, 3]);
    expect(groups.map((g) => g.clauses.map((c) => c.id))).toEqual([["a", "b"], ["c"], ["d", "e"]]);
  });

  it("does not merge a page number that reappears later, order wins over page number", () => {
    const groups = groupByPage([clause("a", 1, 0), clause("b", 2, 1), clause("c", 1, 2)]);

    expect(groups.map((g) => g.pageNumber)).toEqual([1, 2, 1]);
  });

  it("does not modify the clauses it was given", () => {
    const input = [clause("a", 1, 0), clause("b", 2, 1)];
    const snapshot = JSON.parse(JSON.stringify(input));

    groupByPage(input);

    expect(input).toEqual(snapshot);
  });
});

describe("isReadable", () => {
  it.each(["ready", "needs_retake"])("treats %s as readable", (status) => {
    expect(isReadable(status)).toBe(true);
  });

  it.each(["pending", "uploaded", "processing", "failed", "", "something-new"])(
    "does not treat %j as readable",
    (status) => {
      expect(isReadable(status)).toBe(false);
    },
  );
});

describe("isInProgress", () => {
  it.each(["pending", "uploaded", "processing"])("treats %s as still in progress", (status) => {
    expect(isInProgress(status)).toBe(true);
  });

  it.each(["ready", "needs_retake", "failed", "", "something-new"])(
    "does not treat %j as in progress, so polling can stop",
    (status) => {
      expect(isInProgress(status)).toBe(false);
    },
  );

  it("never counts a status as both readable and in progress", () => {
    for (const status of ["pending", "uploaded", "processing", "ready", "needs_retake", "failed"]) {
      expect(isReadable(status) && isInProgress(status)).toBe(false);
    }
  });
});

describe("statusLabel", () => {
  it.each([
    ["ready", "Ready"],
    ["needs_retake", "Hard to read"],
    ["failed", "Couldn't read"],
    ["pending", "Uploading"],
    ["uploaded", "Processing"],
    ["processing", "Processing"],
  ])("labels %s as %s", (status, label) => {
    expect(statusLabel(status)).toBe(label);
  });

  it("shows an unknown status as it is rather than hiding it", () => {
    expect(statusLabel("something-new")).toBe("something-new");
  });

  it("never exposes a raw underscore status name", () => {
    expect(statusLabel("needs_retake")).not.toContain("_");
  });
});


describe("formatUploaded", () => {
  // Built from local dates, so these hold in any time zone.
  const now = new Date(2026, 9, 5, 15, 0, 0); // Oct 5, 2026, 3pm
  const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).toISOString();

  it("says today for earlier the same day", () => {
    expect(formatUploaded(at(2026, 9, 5, 8), now)).toBe("today");
  });

  it("says yesterday for the day before, even a few minutes before midnight", () => {
    expect(formatUploaded(at(2026, 9, 4, 23), now)).toBe("yesterday");
  });

  it("says the month and day for earlier dates this year", () => {
    expect(formatUploaded(at(2026, 8, 25), now)).toBe("Sep 25");
    expect(formatUploaded(at(2026, 0, 2), now)).toBe("Jan 2");
  });

  it("adds the year for another year", () => {
    expect(formatUploaded(at(2025, 11, 30), now)).toBe("Dec 30, 2025");
  });

  it("returns nothing for a missing or unreadable date, so it can be left out", () => {
    expect(formatUploaded(undefined, now)).toBe("");
    expect(formatUploaded(null, now)).toBe("");
    expect(formatUploaded("not a date", now)).toBe("");
  });
});


describe("contentTypeFor", () => {
  it.each([
    ["application/pdf", "contract.pdf"],
    ["image/jpeg", "photo.jpg"],
    ["image/png", "scan.png"],
    ["image/heic", "photo.heic"],
  ])("accepts a file the browser calls %s", (type, name) => {
    expect(contentTypeFor({ name, type })).toBe(type);
  });

  it("trusts the browser's type over the file name", () => {
    expect(contentTypeFor({ name: "really-a-photo.pdf", type: "image/png" })).toBe("image/png");
  });

  it.each([
    ["photo.HEIC", "image/heic"],
    ["scan.jpeg", "image/jpeg"],
    ["scan.JPG", "image/jpeg"],
    ["contract.pdf", "application/pdf"],
  ])("falls back to the extension when the browser gives no type: %s", (name, expected) => {
    expect(contentTypeFor({ name, type: "" })).toBe(expected);
  });

  it("does not guess that an unknown file is a PDF", () => {
    expect(contentTypeFor({ name: "notes.txt", type: "" })).toBeNull();
    expect(contentTypeFor({ name: "no-extension", type: "" })).toBeNull();
  });

  it("rejects a type it does not accept, whatever the file is called", () => {
    expect(contentTypeFor({ name: "contract.pdf", type: "text/plain" })).toBeNull();
    expect(contentTypeFor({ name: "doc.docx", type: "application/vnd.openxmlformats" })).toBeNull();
  });
});

describe("formatFileSize", () => {
  it.each([
    [0, "0 B"],
    [999, "999 B"],
    [1024, "1 KB"],
    [850 * 1024, "850 KB"],
    [1024 * 1024, "1.0 MB"],
    [2.4 * 1024 * 1024, "2.4 MB"],
    [50 * 1024 * 1024, "50.0 MB"],
  ])("shows %d bytes as %s", (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });
});


describe("putFirst and mergeFresh", () => {
  const doc = (id: string, status = "ready") => ({
    id,
    filename: `${id}.pdf`,
    doc_type: "loan",
    status,
    ocr_confidence: null,
  });

  it("puts a document first", () => {
    expect(putFirst([doc("a"), doc("b")], doc("c")).map((d) => d.id)).toEqual(["c", "a", "b"]);
  });

  it("replaces an earlier version of the same document instead of repeating it", () => {
    const result = putFirst([doc("a"), doc("b", "pending")], doc("b", "uploaded"));

    expect(result.map((d) => d.id)).toEqual(["b", "a"]);
    expect(result[0].status).toBe("uploaded");
  });

  it("takes the server's version of every document it returns", () => {
    const result = mergeFresh([doc("a", "processing")], [doc("a", "ready")]);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("ready");
  });

  it("keeps a document only the page knows about, in front of the server's list", () => {
    const result = mergeFresh([doc("new", "uploaded"), doc("a")], [doc("a"), doc("b")]);

    expect(result.map((d) => d.id)).toEqual(["new", "a", "b"]);
  });

  it("lists each document once however the two lists overlap", () => {
    const ids = mergeFresh([doc("a"), doc("b"), doc("c")], [doc("b"), doc("c"), doc("d")]).map((d) => d.id);

    expect(ids).toEqual(["a", "b", "c", "d"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("follows the server's order for what it returns", () => {
    expect(mergeFresh([], [doc("z"), doc("y"), doc("x")]).map((d) => d.id)).toEqual(["z", "y", "x"]);
  });

  it("does not change the lists it was given", () => {
    const local = [doc("a")];
    const fresh = [doc("b")];

    mergeFresh(local, fresh);
    putFirst(local, doc("c"));

    expect(local.map((d) => d.id)).toEqual(["a"]);
    expect(fresh.map((d) => d.id)).toEqual(["b"]);
  });
});
