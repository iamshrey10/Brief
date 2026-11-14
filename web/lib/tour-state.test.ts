// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { clearTourStep, readTourStep, subscribeToTour, writeTourStep } from "./tour-state";

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("the tour's remembered step", () => {
  it("is null until the tour is opened", () => {
    expect(readTourStep(8)).toBeNull();
  });

  it("remembers the step it was given, and forgets it when cleared", () => {
    writeTourStep(3);
    expect(readTourStep(8)).toBe(3);

    clearTourStep();
    expect(readTourStep(8)).toBeNull();
  });

  it("ignores a stored value that is not a step of this tour", () => {
    for (const bad of ["abc", "-1", "1.5", "8", "99"]) {
      window.sessionStorage.setItem("brief-tour-step", bad);
      expect(readTourStep(8)).toBeNull();
    }
  });

  it("tells whoever is listening when it changes, and not after they stop", () => {
    const heard = vi.fn();
    const stop = subscribeToTour(heard);

    writeTourStep(1);
    clearTourStep();
    expect(heard).toHaveBeenCalledTimes(2);

    stop();
    writeTourStep(2);
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it("copes with storage being blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(readTourStep(8)).toBeNull();
    expect(() => writeTourStep(1)).not.toThrow();
    expect(() => clearTourStep()).not.toThrow();
  });
});
