import { describe, expect, it } from "vitest";
import { splitByQuote } from "./highlight";

const CLAUSE = "The borrower may prepay at any time without penalty. Interest accrues daily.";

describe("splitByQuote", () => {
  it("highlights the quoted words and leaves the rest alone", () => {
    expect(splitByQuote(CLAUSE, "without penalty")).toEqual([
      { text: "The borrower may prepay at any time ", highlighted: false },
      { text: "without penalty", highlighted: true },
      { text: ". Interest accrues daily.", highlighted: false },
    ]);
  });

  it("ignores case but keeps the document's own casing in the highlight", () => {
    const segments = splitByQuote(CLAUSE, "WITHOUT PENALTY");

    expect(segments.find((s) => s.highlighted)?.text).toBe("without penalty");
  });

  it("matches across line breaks and uneven spacing in the clause text", () => {
    const text = "Prepay at any time\nwithout   penalty is allowed.";

    const segments = splitByQuote(text, "at any time without penalty");

    expect(segments.find((s) => s.highlighted)?.text).toBe("at any time\nwithout   penalty");
  });

  it("ignores quote marks wrapped around the quote", () => {
    const segments = splitByQuote(CLAUSE, '"without penalty"');

    expect(segments.find((s) => s.highlighted)?.text).toBe("without penalty");
  });

  it("treats regex special characters in the quote literally", () => {
    const text = "A fee of $5.00 (five dollars) applies to each late payment.";

    const segments = splitByQuote(text, "$5.00 (five dollars)");

    expect(segments.find((s) => s.highlighted)?.text).toBe("$5.00 (five dollars)");
  });

  it("does not let a dot in the quote match any character", () => {
    expect(splitByQuote("The code is 5x00 here.", "5.00")).toEqual([
      { text: "The code is 5x00 here.", highlighted: false },
    ]);
  });

  it("highlights only the first occurrence", () => {
    const segments = splitByQuote("late fee, then another late fee", "late fee");

    expect(segments.filter((s) => s.highlighted)).toHaveLength(1);
    expect(segments[0]).toEqual({ text: "late fee", highlighted: true });
  });

  it("returns the whole text unhighlighted when the quote is not in it", () => {
    expect(splitByQuote(CLAUSE, "a two percent early fee")).toEqual([
      { text: CLAUSE, highlighted: false },
    ]);
  });

  it.each(["", "   ", '""', "'"])("returns the whole text unhighlighted for the empty quote %j", (quote) => {
    expect(splitByQuote(CLAUSE, quote)).toEqual([{ text: CLAUSE, highlighted: false }]);
  });

  it("produces no empty segments when the quote is at the start", () => {
    expect(splitByQuote("without penalty applies", "without penalty")).toEqual([
      { text: "without penalty", highlighted: true },
      { text: " applies", highlighted: false },
    ]);
  });

  it("produces no empty segments when the quote is at the end", () => {
    expect(splitByQuote("applies without penalty", "without penalty")).toEqual([
      { text: "applies ", highlighted: false },
      { text: "without penalty", highlighted: true },
    ]);
  });

  it("returns a single highlighted segment when the quote is the whole text", () => {
    expect(splitByQuote("without penalty", "without penalty")).toEqual([
      { text: "without penalty", highlighted: true },
    ]);
  });

  it.each([
    [CLAUSE, "without penalty"],
    [CLAUSE, "nothing like this"],
    [CLAUSE, ""],
    ["Prepay at any time\nwithout   penalty is allowed.", "at any time without penalty"],
    ["A fee of $5.00 (five dollars).", "$5.00 (five dollars)"],
  ])("always joins back into exactly the original text (%#)", (text, quote) => {
    expect(
      splitByQuote(text, quote)
        .map((s) => s.text)
        .join(""),
    ).toBe(text);
  });
});
