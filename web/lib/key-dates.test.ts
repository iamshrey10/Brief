import { describe, expect, it } from "vitest";

import { calendarEvents, clearDates, countdownText, upcomingDates, type KeyDateFromApi } from "./key-dates";

const TODAY = { year: 2026, month: 10, day: 30 };
const term = (name: string, value: string | null, found = true) => ({ name, found, value });

describe("clearDates", () => {
  it("keeps only date fields whose value is one clear date", () => {
    const dates = clearDates([
      term("lease_start", "January 1, 2027"),
      term("lease_end", "when the tenant moves out"),
      term("monthly_rent", "$1,650.00"),
      term("start_date", "March 9, 2026", false),
    ]);

    expect(dates.map((d) => [d.field, d.label])).toEqual([["lease_start", "Lease starts"]]);
    expect(dates[0].date).toEqual({ year: 2027, month: 1, day: 1 });
  });

  it("is empty when nothing is a clear date", () => {
    expect(clearDates([term("lease_end", null)])).toEqual([]);
  });
});

describe("calendarEvents", () => {
  it("makes one event per date, with a steady id, the file name and a week's warning only where it helps", () => {
    const events = calendarEvents("doc-1", "lease.pdf", clearDates([term("lease_start", "January 1, 2027"), term("lease_end", "December 31, 2027")]));

    expect(events.map((e) => [e.uid, e.summary, e.remindDaysBefore])).toEqual([
      ["doc-1-lease_start@brief", "Lease starts: lease.pdf", null],
      ["doc-1-lease_end@brief", "Lease ends: lease.pdf", 7],
    ]);
    expect(events[1].description).toContain("Check it against the document itself");
  });
});

describe("countdownText", () => {
  it.each([
    ["lease_end", 62, "Lease ends in 62 days"],
    ["lease_end", 1, "Lease ends tomorrow"],
    ["lease_end", 0, "Lease ends today"],
    ["lease_end", -1, "Lease ended yesterday"],
    ["lease_end", -5, "Lease ended 5 days ago"],
    ["start_date", 3, "Job starts in 3 days"],
    ["effective_date", -2, "Took effect 2 days ago"],
    ["repayment_start", -9, "Repayments started 9 days ago"],
  ])("says %s at %i days as %s", (field, days, expected) => {
    expect(countdownText(field, days)).toBe(expected);
  });
});

describe("upcomingDates", () => {
  const entry = (document_id: string, field: string, value: string): KeyDateFromApi => ({
    document_id,
    field,
    label: "ignored",
    value,
  });

  it("lists the soonest first, with the wording for how far off each is", () => {
    const list = upcomingDates(
      [entry("a", "lease_end", "December 31, 2026"), entry("b", "start_date", "November 2, 2026")],
      TODAY,
    );

    expect(list.map((u) => [u.documentId, u.text, u.days])).toEqual([
      ["b", "Job starts in 3 days", 3],
      ["a", "Lease ends in 62 days", 62],
    ]);
  });

  it("leaves out a loose phrase, an unknown field, and anything more than a week past", () => {
    const list = upcomingDates(
      [
        entry("a", "lease_end", "six months after graduation"),
        entry("b", "mystery", "December 31, 2026"),
        entry("c", "lease_end", "October 1, 2026"),
        entry("d", "lease_end", "October 25, 2026"),
      ],
      TODAY,
    );

    expect(list.map((u) => u.documentId)).toEqual(["d"]);
    expect(list[0].text).toBe("Lease ended 5 days ago");
  });

  it("keeps the strip short", () => {
    const many = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"].map((d, i) => entry(String(i), "lease_end", d));

    expect(upcomingDates(many, TODAY)).toHaveLength(3);
    expect(upcomingDates(many, TODAY, 2)).toHaveLength(2);
  });
});
