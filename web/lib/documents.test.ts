import { describe, expect, it } from "vitest";
import { groupByPage, isInProgress, isReadable, statusLabel, type ClauseData } from "./documents";

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
