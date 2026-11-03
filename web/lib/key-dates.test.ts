import { describe, expect, it } from "vitest";

import { calendarEvents, clearDates } from "./key-dates";

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
