// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActivityPing, IDLE_AFTER_MS, SIGNAL_EVERY_MS } from "./activity-ping";

const fetchMock = vi.fn();
let visibility: DocumentVisibilityState = "visible";

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const touch = () => act(() => void window.dispatchEvent(new Event("pointerdown")));

describe("ActivityPing", () => {
  it("sends one signal as soon as Brief opens, to the backend route, with nothing in it", () => {
    render(<ActivityPing />);

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/backend/me/activity", { method: "POST", keepalive: true });
  });

  it("sends another every half minute while it is in use", async () => {
    render(<ActivityPing />);

    await tick(SIGNAL_EVERY_MS);
    touch();
    await tick(SIGNAL_EVERY_MS);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("sends nothing from a tab in the background", async () => {
    visibility = "hidden";
    render(<ActivityPing />);

    await tick(SIGNAL_EVERY_MS * 4);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing once nobody has touched the page for two minutes, and starts again when they do", async () => {
    render(<ActivityPing />);
    fetchMock.mockClear();

    await tick(IDLE_AFTER_MS + SIGNAL_EVERY_MS);
    expect(fetchMock).toHaveBeenCalledTimes(Math.floor((IDLE_AFTER_MS) / SIGNAL_EVERY_MS));  // the signals up to the idle limit
    fetchMock.mockClear();

    await tick(SIGNAL_EVERY_MS * 3);
    expect(fetchMock).not.toHaveBeenCalled();

    touch();
    await tick(SIGNAL_EVERY_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends a signal when the person comes back to the tab", async () => {
    visibility = "hidden";
    render(<ActivityPing />);
    expect(fetchMock).not.toHaveBeenCalled();

    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not break the page when the signal cannot be sent", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));

    expect(() => render(<ActivityPing />)).not.toThrow();
    await tick(SIGNAL_EVERY_MS);
  });

  it("stops when the page goes", async () => {
    const { unmount } = render(<ActivityPing />);
    unmount();
    fetchMock.mockClear();

    await tick(SIGNAL_EVERY_MS * 3);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
