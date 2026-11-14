import { describe, expect, it } from "vitest";

import { TOUR_STEPS, TOUR_URL } from "./tour-steps";

describe("the tour steps", () => {
  it("is opened by the address the welcome page and Profile use", () => {
    expect(TOUR_URL).toBe("/dashboard?tour=1");
  });

  it("has a unique id and some words for every step", () => {
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(TOUR_STEPS.length);
    for (const step of TOUR_STEPS) {
      expect(step.title.length).toBeGreaterThan(3);
      expect(step.body.length).toBeGreaterThan(20);
    }
  });

  it("points only at parts of pages the step belongs to", () => {
    for (const step of TOUR_STEPS) {
      if (step.target) expect(step.path).toBeTruthy();
      if (step.path) expect(step.path.startsWith("/dashboard")).toBe(true);
    }
  });

  it("covers each part of Brief", () => {
    const text = TOUR_STEPS.map((s) => `${s.title} ${s.body} ${(s.points ?? []).join(" ")}`).join(" ");

    for (const part of ["sample lease", "Key terms", "Key dates", "Before you sign", "Ask", "Share your dashboard", "90 days", "Bin", "7 days", "Two-step"]) {
      expect(text).toContain(part);
    }
  });

  it("uses no em dashes", () => {
    expect(JSON.stringify(TOUR_STEPS)).not.toContain("—");
  });
});
