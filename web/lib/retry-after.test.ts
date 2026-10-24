import { describe, expect, it } from "vitest";

import { secondsUntilNextWindow } from "./retry-after";

const at = (iso: string) => new Date(iso).getTime();

describe("secondsUntilNextWindow", () => {
  it("is a whole minute at the very start of a minute", () => {
    expect(secondsUntilNextWindow(at("2026-10-24T12:00:00.000Z"))).toBe(60);
  });

  it("counts down through the minute", () => {
    expect(secondsUntilNextWindow(at("2026-10-24T12:00:45.000Z"))).toBe(15);
  });

  it("rounds a part of a second up, so the person never retries a moment too early", () => {
    expect(secondsUntilNextWindow(at("2026-10-24T12:00:59.100Z"))).toBe(1);
  });

  it("is never below 1 or above 60", () => {
    for (let ms = 0; ms < 120_000; ms += 777) {
      const wait = secondsUntilNextWindow(at("2026-10-24T12:00:00.000Z") + ms);
      expect(wait).toBeGreaterThanOrEqual(1);
      expect(wait).toBeLessThanOrEqual(60);
    }
  });
});
