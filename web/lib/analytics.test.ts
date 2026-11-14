// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { analyticsId, readChoice, startAnalytics, stopAnalytics, subscribeToChoice, writeChoice } from "./analytics";

type W = Window & { dataLayer?: unknown[]; gtag?: unknown } & Record<string, unknown>;

beforeEach(() => {
  window.localStorage.clear();
  document.head.innerHTML = "";
  delete (window as unknown as W).dataLayer;
  delete (window as unknown as W).gtag;
  delete (window as unknown as W)["ga-disable-G-TEST123456"];
});
afterEach(() => vi.restoreAllMocks());

describe("analyticsId", () => {
  it("accepts a measurement id and tidies spaces", () => {
    expect(analyticsId(" G-ABC1234567 ")).toBe("G-ABC1234567");
  });

  it("ignores anything that is not one, so nothing loads by mistake", () => {
    for (const bad of [undefined, "", "   ", "UA-12345-1", "g-abc1234567", "G-", "G-ABC123456789012345", "G-ABC 123456", "<script>"]) {
      expect(analyticsId(bad)).toBeNull();
    }
  });

  it("reads the setting from the environment when none is passed", () => {
    vi.stubEnv("NEXT_PUBLIC_GA_ID", "G-ENVID12345");
    expect(analyticsId()).toBe("G-ENVID12345");
    vi.unstubAllEnvs();
  });
});

describe("the saved choice", () => {
  it("starts empty, and remembers yes and no", () => {
    expect(readChoice()).toBeNull();
    writeChoice("accepted");
    expect(readChoice()).toBe("accepted");
    writeChoice("declined");
    expect(readChoice()).toBe("declined");
  });

  it("treats anything else stored as no answer yet", () => {
    window.localStorage.setItem("brief-analytics-choice", "maybe");
    expect(readChoice()).toBeNull();
  });

  it("tells listeners about a change here and in another tab, and stops when they leave", () => {
    const listener = vi.fn();
    const stop = subscribeToChoice(listener);
    writeChoice("accepted");
    expect(listener).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new StorageEvent("storage", { key: "brief-analytics-choice" }));
    expect(listener).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new StorageEvent("storage", { key: "something-else" }));
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    writeChoice("declined");
    window.dispatchEvent(new StorageEvent("storage", { key: "brief-analytics-choice" }));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("copes with storage being blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readChoice()).toBeNull();
    expect(() => writeChoice("accepted")).not.toThrow();
  });
});

describe("starting and stopping", () => {
  it("loads Google's script once, with shortened addresses and no advertising features", () => {
    startAnalytics("G-TEST123456");
    startAnalytics("G-TEST123456");

    const scripts = document.head.querySelectorAll("script#google-analytics-script");
    expect(scripts).toHaveLength(1);
    expect((scripts[0] as HTMLScriptElement).src).toBe("https://www.googletagmanager.com/gtag/js?id=G-TEST123456");
    const layer = (window as unknown as W).dataLayer as ArrayLike<unknown>[];
    expect(layer).toHaveLength(2);
    expect(Array.from(layer[0])[0]).toBe("js");
    expect(Array.from(layer[1])).toEqual([
      "config",
      "G-TEST123456",
      { anonymize_ip: true, allow_google_signals: false, allow_ad_personalization_signals: false },
    ]);
  });

  it("keeps an existing data layer", () => {
    (window as unknown as W).dataLayer = ["kept"];
    startAnalytics("G-TEST123456");
    expect((window as unknown as W).dataLayer![0]).toBe("kept");
  });

  it("stops sending with Google's own switch, and turns it back on when counting restarts", () => {
    startAnalytics("G-TEST123456");
    stopAnalytics("G-TEST123456");
    expect((window as unknown as W)["ga-disable-G-TEST123456"]).toBe(true);
    startAnalytics("G-TEST123456");
    expect((window as unknown as W)["ga-disable-G-TEST123456"]).toBe(false);
  });
});
