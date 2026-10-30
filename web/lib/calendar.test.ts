import { describe, expect, it } from "vitest";

import { buildCalendarFile, escapeText, foldLine, type CalendarEvent } from "./calendar";

const NOW = new Date("2026-10-30T15:00:00.000Z");
const END: CalendarEvent = {
  uid: "doc-1-lease_end@brief",
  date: { year: 2027, month: 12, day: 31 },
  summary: "Lease ends",
  description: "From your lease in Brief.",
  remindDaysBefore: 7,
};

function unfold(file: string): string[] {
  return file.replace(/\r\n /g, "").split("\r\n").filter(Boolean);
}

describe("buildCalendarFile", () => {
  const file = buildCalendarFile([END], NOW);
  const lines = unfold(file);

  it("is a calendar with CRLF line ends and one event", () => {
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines.at(-1)).toBe("END:VCALENDAR");
    expect(file.endsWith("\r\n")).toBe(true);
    expect(file.replace(/\r\n/g, "")).not.toContain("\n");
    expect(lines.filter((line) => line === "BEGIN:VEVENT")).toHaveLength(1);
  });

  it("makes an all day event on the date, ending the day after because the end is exclusive", () => {
    expect(lines).toContain("DTSTART;VALUE=DATE:20271231");
    expect(lines).toContain("DTEND;VALUE=DATE:20280101");
    expect(lines).toContain("SUMMARY:Lease ends");
  });

  it("gives the event a steady id and the time it was made", () => {
    expect(lines).toContain("UID:doc-1-lease_end@brief");
    expect(lines).toContain("DTSTAMP:20261030T150000Z");
  });

  it("reminds a number of days before when asked, and not at all when not", () => {
    expect(lines).toContain("TRIGGER:-P7D");
    const without = unfold(buildCalendarFile([{ ...END, remindDaysBefore: null }], NOW));
    expect(without.some((line) => line.startsWith("TRIGGER"))).toBe(false);
    expect(without).not.toContain("BEGIN:VALARM");
  });

  it("shows as free time, so a date does not block the day", () => {
    expect(lines).toContain("TRANSP:TRANSPARENT");
  });

  it("holds several events in order", () => {
    const two = unfold(buildCalendarFile([{ ...END, uid: "a", summary: "First" }, { ...END, uid: "b", summary: "Second" }], NOW));

    expect(two.filter((line) => line.startsWith("SUMMARY"))).toEqual(["SUMMARY:First", "SUMMARY:Second"]);
  });
});

describe("escapeText", () => {
  it("escapes what the format reserves and writes line breaks as \\n", () => {
    expect(escapeText("a, b; c\\d\ne")).toBe("a\\, b\; c\\\\d\\ne");
  });
});

describe("foldLine", () => {
  it("leaves a short line alone", () => {
    expect(foldLine("SUMMARY:Lease ends")).toBe("SUMMARY:Lease ends");
  });

  it("folds a long line so none is over 75 bytes, and unfolding gives the original back", () => {
    const long = `DESCRIPTION:${"word ".repeat(40)}`;
    const folded = foldLine(long);

    for (const piece of folded.split("\r\n")) expect(new TextEncoder().encode(piece).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(long);
  });

  it("does not cut a multi byte character in half", () => {
    const long = `SUMMARY:${"é".repeat(60)}`;

    expect(foldLine(long).replace(/\r\n /g, "")).toBe(long);
  });
});
