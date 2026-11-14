import { describe, expect, it } from "vitest";

import { asAdminReport, asAdminStats, change, kindLabel, minutesText, percentText, ranked, reasonLabel, reportCsv, reportFileName, reportPdf, reportRows, shortDay, statusLabel, type AdminDay, type AdminPeriod } from "./admin";

const day = (label: string, fields: Partial<AdminDay> = {}): AdminDay => ({ day: label, signed_up: 0, people: 0, visits: 0, minutes: 0, documents: 0, questions: 0, reads: 0, overviews: 0, demo_opened: 0, demo_finished: 0, ...fields });
const period = (fields: Partial<AdminPeriod> = {}): AdminPeriod => ({ signed_up: 3, people: 5, visits: 9, minutes: 41.5, documents: 6, questions: 22, reads: 4, overviews: 3, demo_opened: 11, demo_finished: 4, average_minutes_per_visit: 4.6, ...fields });

const full = {
  generated_at: "2026-11-12T22:00:00Z",
  range_days: 30,
  people: { total: 12, new_7_days: 5, new_30_days: 11, active_today: 3, active_7_days: 7, active_30_days: 10 },
  time_in_brief: { average_minutes_per_person_per_day_7_days: 6.5, average_minutes_per_visit_7_days: 3.2, visits_7_days: 40 },
  documents: { stored: 30, uploaded_7_days: 9, uploaded_30_days: 28, by_kind: { lease: 20, loan: 10 }, by_status: { ready: 28, failed: 2 }, photos: 4, pdfs_and_other: 26 },
  questions: { asked_total: 210, asked_today: 14, asked_7_days: 96 },
  reads: { total: 40, today: 3 },
  overviews: { total: 31, today: 2 },
  reasons: { lease: 6, loan: 3, not_said: 3 },
  sharing: { waiting_or_active: 2, active: 1 },
  site: { model_calls_today: 120, daily_limit: 3000 },
  funnel: { signed_up: 12, uploaded_a_document: 9, asked_a_question: 7, came_back_another_day: 4, shared_their_dashboard: 2 },
  demo: { opened_total: 48, finished_total: 19, opened_7_days: 12, finished_7_days: 5, opened_30_days: 40, finished_30_days: 16 },
  period: { current: period(), previous: period({ signed_up: 2 }) },
  by_day: [day("2026-11-11", { signed_up: 2, people: 4, minutes: 31.5 })],
};

describe("asAdminStats", () => {
  it("reads every number the backend sends", () => {
    expect(asAdminStats(full)).toEqual(full);
  });

  it("is null for anything that is not the numbers, such as the not found answer", () => {
    expect(asAdminStats(null)).toBeNull();
    expect(asAdminStats({ detail: "not found" })).toBeNull();
    expect(asAdminStats("text")).toBeNull();
    expect(asAdminStats([])).toBeNull();
  });

  it("counts anything missing or not a number as nothing, and keeps going", () => {
    const stats = asAdminStats({ generated_at: "x", people: { total: "many" }, documents: { by_kind: { lease: "7", loan: 2 } }, by_day: [{ day: "2026-11-11" }, { people: 1 }, null] })!;

    expect(stats.people.total).toBe(0);
    expect(stats.documents.by_kind).toEqual({ lease: 0, loan: 2 });
    expect(stats.by_day).toEqual([day("2026-11-11")]);
    expect(stats.range_days).toBe(30);
    expect(stats.funnel.signed_up).toBe(0);
    expect(stats.demo.opened_total).toBe(0);
    expect(stats.period.current.average_minutes_per_visit).toBe(0);
    expect(stats.site).toEqual({ model_calls_today: 0, daily_limit: 0 });
  });
});

describe("the wording", () => {
  it("gives plain names for kinds, statuses and reasons, and falls back to the word itself", () => {
    expect(kindLabel("loan")).toBe("Education loans");
    expect(statusLabel("needs_retake")).toBe("Photo needs retaking");
    expect(reasonLabel("not_said")).toBe("Did not say");
    expect(reasonLabel("something_new")).toBe("something_new");
  });

  it("shows a short time in the unit that reads best", () => {
    expect(minutesText(0)).toBe("0 min");
    expect(minutesText(0.75)).toBe("45 sec");
    expect(minutesText(1.2)).toBe("1.2 min");
    expect(minutesText(12)).toBe("12 min");
    expect(minutesText(65)).toBe("1 h 5 min");
  });

  it("writes a day short, whichever time zone the reader is in", () => {
    expect(shortDay("2026-11-12")).toBe("Nov 12");
    expect(shortDay("2026-01-05")).toBe("Jan 5");
  });
});

describe("ranked", () => {
  it("orders the biggest first, with each one's share, and leaves out the zeros", () => {
    expect(ranked({ a: 1, b: 3, c: 0, d: 1 })).toEqual([
      { key: "b", count: 3, share: 0.6 },
      { key: "a", count: 1, share: 0.2 },
      { key: "d", count: 1, share: 0.2 },
    ]);
  });

  it("is empty when there is nothing", () => {
    expect(ranked({})).toEqual([]);
    expect(ranked({ a: 0 })).toEqual([]);
  });
});

describe("change", () => {
  it("says which way a number moved and by how much", () => {
    expect(change(150, 100)).toEqual({ direction: "up", text: "+50%" });
    expect(change(60, 100)).toEqual({ direction: "down", text: "-40%" });
    expect(change(7, 7)).toEqual({ direction: "flat", text: "No change" });
  });

  it("says new when there was nothing before to take a share of", () => {
    expect(change(4, 0)).toEqual({ direction: "new", text: "New" });
  });

  it("does not round a small move to nothing and call it no change", () => {
    expect(change(1001, 1000)).toEqual({ direction: "up", text: "+<1%" });
    expect(change(999, 1000)).toEqual({ direction: "down", text: "-<1%" });
  });
});

describe("percentText", () => {
  it("is a whole percent, or none yet when there is nothing to take it of", () => {
    expect(percentText(19, 48)).toBe("40%");
    expect(percentText(0, 0)).toBe("None yet");
  });
});

/** How a PDF writes a text: as hexadecimal codes, one for each character. */
const hexOf = (text: string) => Array.from(text, (char) => char.charCodeAt(0).toString(16).padStart(2, "0")).join("");

const report = {
  period: "month",
  label: "2026-11",
  from: "2026-11-01",
  to: "2026-11-02",
  generated_at: "2026-11-12T22:00:00Z",
  totals: period(),
  reasons_of_new_people: { lease: 2, loan: 1 },
  by_day: [day("2026-11-01", { signed_up: 1, people: 2, minutes: 10.5, questions: 7 }), day("2026-11-02", { demo_opened: 4 })],
};

describe("asAdminReport", () => {
  it("reads a report, with every number a total", () => {
    const read = asAdminReport(report)!;

    expect(read.label).toBe("2026-11");
    expect(read.totals.questions).toBe(22);
    expect(read.by_day).toHaveLength(2);
    expect(read.by_day[1].demo_opened).toBe(4);
  });

  it("is null for anything that is not a report", () => {
    expect(asAdminReport(null)).toBeNull();
    expect(asAdminReport({ detail: "not found" })).toBeNull();
    expect(asAdminReport({ ...report, period: "year" })).toBeNull();
    expect(asAdminReport({ ...report, label: 5 })).toBeNull();
  });

  it("counts anything missing as nothing", () => {
    const read = asAdminReport({ period: "day", label: "2026-11-12", from: "2026-11-12", to: "2026-11-12", by_day: [null, { day: "2026-11-12" }] })!;

    expect(read.totals.people).toBe(0);
    expect(read.generated_at).toBe("");
    expect(read.by_day).toEqual([day("2026-11-12")]);
  });
});

describe("a report as a file", () => {
  it("lists the totals in plain words", () => {
    expect(reportRows(period()).map(([label]) => label)).toEqual([
      "New people", "Active people", "Visits", "Minutes in Brief", "Average minutes per visit", "Documents uploaded", "Questions asked", "Documents read", "Overviews made", "Demo video opened", "Demo video watched to the end",
    ]);
  });

  it("is a CSV with the totals, why people came, and a row for each day, that a spreadsheet can open", () => {
    const csv = reportCsv(asAdminReport(report)!);
    const lines = csv.split("\r\n");

    expect(lines[0]).toBe("Brief report,Month,2026-11");
    expect(lines).toContain("Questions asked,22");
    expect(lines).toContain("Check a lease,2");
    expect(lines).toContain("Day,New people,Active people,Visits,Minutes,Documents,Questions,Reads,Overviews,Demo opened,Demo finished");
    expect(lines).toContain("2026-11-01,1,2,0,10.5,0,7,0,0,0,0");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("says so in the CSV when nobody signed up", () => {
    expect(reportCsv(asAdminReport({ ...report, reasons_of_new_people: {} })!)).toContain("None signed up in this time");
  });

  it("quotes a value that holds a comma or a quote, so a row cannot be broken", () => {
    const csv = reportCsv({ ...asAdminReport(report)!, reasons_of_new_people: { 'odd, "reason"': 1 } });

    expect(csv).toContain('"odd, ""reason""",1');
  });

  it("is a PDF with the title, the totals and a line for each day", () => {
    const text = new TextDecoder("latin1").decode(reportPdf(asAdminReport(report)!));

    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("%%EOF");
    expect(text.toLowerCase()).toContain(hexOf("Brief monthly report, 2026-11"));
    expect(text.toLowerCase()).toContain(hexOf("Questions asked: 22"));
    expect(text.toLowerCase()).toContain(hexOf("Check a lease: 2"));
  });

  it("makes a PDF for one day, and one when nobody signed up", () => {
    const one = asAdminReport({ ...report, period: "day", label: "2026-11-01", to: "2026-11-01", reasons_of_new_people: {} })!;

    const text = new TextDecoder("latin1").decode(reportPdf(one)).toLowerCase();
    expect(text).toContain(hexOf("Brief daily report, 2026-11-01"));
    expect(text).toContain(hexOf("None signed up in this time."));
  });

  it("is named for what it is", () => {
    expect(reportFileName(asAdminReport(report)!, "csv")).toBe("brief-monthly-report-2026-11.csv");
    expect(reportFileName({ ...asAdminReport(report)!, period: "day", label: "2026-11-12" }, "pdf")).toBe("brief-daily-report-2026-11-12.pdf");
  });

  it("names no person, document or question", () => {
    expect(reportCsv(asAdminReport(report)!)).not.toMatch(/@|\.pdf|\.jpg/i);
  });
});
