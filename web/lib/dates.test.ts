import { describe, expect, it } from "vitest";

import { daysBetween, localToday, nextDay, parseClearDate, toISODate } from "./dates";

const iso = (text: string | null | undefined) => {
  const date = parseClearDate(text);
  return date ? toISODate(date) : null;
};

describe("parseClearDate", () => {
  it.each([
    ["March 9, 2026", "2026-03-09"],
    ["mar 9 2026", "2026-03-09"],
    ["Sept. 1st, 2027", "2027-09-01"],
    ["9 March 2026", "2026-03-09"],
    ["the 31st of December 2027", "2027-12-31"],
    ["2026-03-09", "2026-03-09"],
    ["The Lease ends on December 31, 2027 at noon", "2027-12-31"],
    ["July 8, 2027 (the same day as the end of term, July 8, 2027)", "2027-07-08"],
  ])("reads %s", (text, expected) => {
    expect(iso(text)).toBe(expected);
  });

  it.each([
    ["nothing", null],
    ["empty", ""],
    ["a phrase with no date", "6 months after graduation"],
    ["a month and year only", "June 2026"],
    ["a day with no year", "March 9"],
    ["a made up day", "February 30, 2026"],
    ["a numeric date, which means different days in different countries", "03/04/2026"],
    ["two different dates", "from March 9, 2026 to July 8, 2027"],
    ["a year out of range", "January 1, 1066"],
  ])("gives up on %s", (_name, text) => {
    expect(iso(text)).toBeNull();
  });

  it("reads a leap day only in a leap year", () => {
    expect(iso("February 29, 2028")).toBe("2028-02-29");
    expect(iso("February 29, 2027")).toBeNull();
  });
});

describe("daysBetween", () => {
  const day = (year: number, month: number, d: number) => ({ year, month, day: d });

  it("counts whole days, forwards and backwards", () => {
    expect(daysBetween(day(2026, 10, 30), day(2026, 11, 1))).toBe(2);
    expect(daysBetween(day(2026, 11, 1), day(2026, 10, 30))).toBe(-2);
    expect(daysBetween(day(2026, 10, 30), day(2026, 10, 30))).toBe(0);
  });

  it("is not thrown off by a clock change, because days carry no time", () => {
    expect(daysBetween(day(2026, 3, 7), day(2026, 3, 9))).toBe(2);
    expect(daysBetween(day(2026, 10, 31), day(2026, 11, 2))).toBe(2);
  });

  it("counts across a year end and a leap day", () => {
    expect(daysBetween(day(2026, 12, 31), day(2027, 1, 1))).toBe(1);
    expect(daysBetween(day(2028, 2, 28), day(2028, 3, 1))).toBe(2);
  });
});

describe("nextDay and localToday", () => {
  it("moves to the next day across a month and a year end", () => {
    expect(nextDay({ year: 2026, month: 12, day: 31 })).toEqual({ year: 2027, month: 1, day: 1 });
    expect(nextDay({ year: 2026, month: 2, day: 28 })).toEqual({ year: 2026, month: 3, day: 1 });
  });

  it("is the calendar day where the clock is", () => {
    expect(localToday(new Date(2026, 9, 30, 23, 59))).toEqual({ year: 2026, month: 10, day: 30 });
  });
});
