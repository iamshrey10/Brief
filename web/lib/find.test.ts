import { describe, expect, it } from "vitest";

import { countMatches, isSearching, splitByFind, stepMatch } from "./find";

const matched = (text: string, query: string) => splitByFind(text, query).filter((s) => s.match).map((s) => s.text);

describe("splitByFind", () => {
  it("splits around each match and keeps all the text, in order", () => {
    const parts = splitByFind("A late fee of $50 is a late fee.", "late fee");

    expect(parts.map((p) => p.text).join("")).toBe("A late fee of $50 is a late fee.");
    expect(parts.map((p) => [p.text, p.match])).toEqual([
      ["A ", false],
      ["late fee", true],
      [" of $50 is a ", false],
      ["late fee", true],
      [".", false],
    ]);
  });

  it("ignores case, and shows the match as the document wrote it", () => {
    expect(matched("The DEPOSIT is refundable. A deposit", "Deposit")).toEqual(["DEPOSIT", "deposit"]);
  });

  it("treats what was typed as plain letters, not as a pattern", () => {
    expect(matched("Pay $1,450.00 (b) now. Pay $1,4500", "$1,450.00")).toEqual(["$1,450.00"]);
    expect(matched("see clause (b) and (c)", "(b)")).toEqual(["(b)"]);
    expect(matched("a.b and axb", "a.b")).toEqual(["a.b"]);
    expect(matched("anything", ".*")).toEqual([]);
  });

  it("ignores spaces around the search", () => {
    expect(matched("the rent is due", "  rent ")).toEqual(["rent"]);
  });

  it("does not search for a single letter or for nothing", () => {
    expect(splitByFind("banana", "a")).toEqual([{ text: "banana", match: false }]);
    expect(splitByFind("banana", "")).toEqual([{ text: "banana", match: false }]);
    expect(splitByFind("banana", "   ")).toEqual([{ text: "banana", match: false }]);
  });

  it("returns the whole text when nothing matches, and handles an empty text", () => {
    expect(splitByFind("no luck here", "zebra")).toEqual([{ text: "no luck here", match: false }]);
    expect(splitByFind("", "rent")).toEqual([{ text: "", match: false }]);
  });

  it("finds a match at the very start and the very end", () => {
    expect(splitByFind("rent due rent", "rent").map((p) => p.match)).toEqual([true, false, true]);
  });
});

describe("countMatches, isSearching and stepMatch", () => {
  it("counts matches per piece of text", () => {
    expect(countMatches(["late fee, late fee", "no", "Late Fee"], "late fee")).toEqual([2, 0, 1]);
    expect(countMatches(["late fee"], "x")).toEqual([0]);
  });

  it("only searches from two letters", () => {
    expect(isSearching("a")).toBe(false);
    expect(isSearching(" a ")).toBe(false);
    expect(isSearching("ab")).toBe(true);
  });

  it("steps forward and back, wrapping round at both ends", () => {
    expect(stepMatch(0, 3, 1)).toBe(1);
    expect(stepMatch(2, 3, 1)).toBe(0);
    expect(stepMatch(0, 3, -1)).toBe(2);
    expect(stepMatch(1, 3, -1)).toBe(0);
    expect(stepMatch(0, 0, 1)).toBe(0);
  });
});
