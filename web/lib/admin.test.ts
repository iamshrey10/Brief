import { describe, expect, it } from "vitest";

import { asAdminStats, kindLabel, minutesText, ranked, reasonLabel, shortDay, statusLabel } from "./admin";

const full = {
  generated_at: "2026-11-12T22:00:00Z",
  people: { total: 12, new_7_days: 5, new_30_days: 11, active_today: 3, active_7_days: 7, active_30_days: 10 },
  time_in_brief: { average_minutes_per_person_per_day_7_days: 6.5, average_minutes_per_visit_7_days: 3.2, visits_7_days: 40 },
  documents: { stored: 30, uploaded_7_days: 9, uploaded_30_days: 28, by_kind: { lease: 20, loan: 10 }, by_status: { ready: 28, failed: 2 }, photos: 4, pdfs_and_other: 26 },
  questions: { asked_total: 210, asked_today: 14, asked_7_days: 96 },
  reads: { total: 40, today: 3 },
  overviews: { total: 31, today: 2 },
  reasons: { lease: 6, loan: 3, not_said: 3 },
  sharing: { waiting_or_active: 2, active: 1 },
  site: { model_calls_today: 120, daily_limit: 3000 },
  by_day: [{ day: "2026-11-11", signed_up: 2, people: 4, minutes: 31.5 }],
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
    expect(stats.by_day).toEqual([{ day: "2026-11-11", signed_up: 0, people: 0, minutes: 0 }]);
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
