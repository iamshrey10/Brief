import { describe, expect, it } from "vitest";

import { accessBody, ACCESS_OPTIONS, chosenAccessText, dateBounds, dayText, DEFAULT_ACCESS_HOURS, endOfDay, MAX_ACCESS_DAYS, timeLeftText } from "./share-access";

const now = new Date(2026, 10, 12, 15, 0, 0); // 12 November 2026, 3 pm, wherever the test runs
const after = (ms: number) => new Date(now.getTime() + ms).toISOString();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("the lengths on offer", () => {
  it("are the seven the backend accepts, shortest first", () => {
    expect(ACCESS_OPTIONS.map((option) => option.hours)).toEqual([1, 6, 24, 168, 360, 720, 2160]);
    expect(ACCESS_OPTIONS.map((option) => option.label)).toEqual(["1 hour", "6 hours", "1 day", "7 days", "15 days", "30 days", "90 days"]);
  });

  it("default to a week, which is one of them", () => {
    expect(ACCESS_OPTIONS.some((option) => option.hours === DEFAULT_ACCESS_HOURS)).toBe(true);
    expect(DEFAULT_ACCESS_HOURS).toBe(168);
  });
});

describe("accessBody", () => {
  it("sends hours for a length of time and until for a date", () => {
    expect(accessBody({ kind: "hours", hours: 24 })).toEqual({ hours: 24 });
    expect(accessBody({ kind: "until", until: "2026-11-30T23:59:59.000Z" })).toEqual({ until: "2026-11-30T23:59:59.000Z" });
  });
});

describe("the calendar", () => {
  it("offers today up to 90 days on", () => {
    const { min, max } = dateBounds(now);

    expect(min).toBe("2026-11-12");
    expect(max).toBe(dayText(new Date(2026, 10, 12 + MAX_ACCESS_DAYS)));
    expect(max).toBe("2027-02-10");
  });

  it("turns a chosen day into the close of that day where the person is", () => {
    const iso = endOfDay("2026-11-30", now)!;
    const end = new Date(iso);

    expect([end.getFullYear(), end.getMonth(), end.getDate(), end.getHours(), end.getMinutes(), end.getSeconds()]).toEqual([2026, 10, 30, 23, 59, 59]);
  });

  it("accepts today and the last day offered", () => {
    expect(endOfDay("2026-11-12", now)).not.toBeNull();
    expect(endOfDay("2027-02-10", now)).not.toBeNull();
  });

  it("refuses a day that is over, one past the 90 days, and text that is not a day", () => {
    expect(endOfDay("2026-11-11", now)).toBeNull();
    expect(endOfDay("2027-02-11", now)).toBeNull();
    expect(endOfDay("2026-02-30", now)).toBeNull();
    expect(endOfDay("tomorrow", now)).toBeNull();
    expect(endOfDay("", now)).toBeNull();
  });
});

describe("timeLeftText", () => {
  it("says days, hours or minutes, whichever is the useful one", () => {
    expect(timeLeftText(after(7 * DAY), now)).toBe("Ends in 7 days");
    expect(timeLeftText(after(3 * DAY + 5 * HOUR), now)).toBe("Ends in 3 days");
    expect(timeLeftText(after(30 * HOUR), now)).toBe("Ends in 30 hours");
    expect(timeLeftText(after(5 * HOUR + 10 * MINUTE), now)).toBe("Ends in 5 hours");
    expect(timeLeftText(after(20 * MINUTE), now)).toBe("Ends in 20 minutes");
  });

  it("uses the singular for one", () => {
    expect(timeLeftText(after(MINUTE), now)).toBe("Ends in 1 minute");
    expect(timeLeftText(after(HOUR), now)).toBe("Ends in 1 hour");
  });

  it("rounds a part minute up, so it never says it ended while a moment is left", () => {
    expect(timeLeftText(after(10_000), now)).toBe("Ends in 1 minute");
  });

  it("says it ended once the time has passed", () => {
    expect(timeLeftText(after(0), now)).toBe("Ended");
    expect(timeLeftText(after(-DAY), now)).toBe("Ended");
  });

  it("says nothing when there is no end", () => {
    expect(timeLeftText(null, now)).toBe("");
  });
});

describe("chosenAccessText", () => {
  it("says what was chosen for someone who is not approved yet", () => {
    expect(chosenAccessText(168, null, now)).toBe("7 days once you approve");
    expect(chosenAccessText(1, null, now)).toBe("1 hour once you approve");
    expect(chosenAccessText(2160, null, now)).toBe("90 days once you approve");
  });

  it("assumes a week when nothing was recorded", () => {
    expect(chosenAccessText(null, null, now)).toBe("7 days once you approve");
  });

  it("says how far away a chosen date is", () => {
    expect(chosenAccessText(null, after(12 * DAY - HOUR), now)).toBe("Until a date 12 days away");
    expect(chosenAccessText(null, after(HOUR), now)).toBe("Until a date 1 day away");
  });
});
