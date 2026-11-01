// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RevealOnView } from "./reveal-on-view";

type Callback = (entries: { isIntersecting: boolean }[]) => void;
let callback: Callback;
let observed: Element[];
let disconnect: ReturnType<typeof vi.fn>;

function stubObserver() {
  observed = [];
  disconnect = vi.fn();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: Callback) {
        callback = cb;
      }
      observe(element: Element) {
        observed.push(element);
      }
      disconnect = disconnect;
    },
  );
}
function stubMotion(lessMotion: boolean) {
  Object.defineProperty(window, "matchMedia", { value: vi.fn().mockReturnValue({ matches: lessMotion }), configurable: true, writable: true });
}
const scroll = (isIntersecting: boolean) => act(() => callback([{ isIntersecting }]));

beforeEach(() => {
  stubObserver();
  stubMotion(false);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the reveal on view", () => {
  it("keeps everything in it present whatever happens, and passes a class on", () => {
    render(
      <RevealOnView className="grid">
        <p>content</p>
      </RevealOnView>,
    );

    expect(screen.getByText("content")).toBeInTheDocument();
    expect(screen.getByText("content").parentElement).toHaveClass("grid");
  });

  it("is ready to appear, and not yet shown, when motion is welcome and it is off screen", () => {
    render(<RevealOnView><span>x</span></RevealOnView>);
    const wrapper = screen.getByText("x").parentElement!;

    expect(wrapper).toHaveAttribute("data-reveal", "armed");
    expect(wrapper).toHaveAttribute("data-active", "false");
    expect(observed).toEqual([wrapper]);
  });

  it("shows when it scrolls into view, and is active only while it is on screen", () => {
    render(<RevealOnView><span>x</span></RevealOnView>);
    const wrapper = screen.getByText("x").parentElement!;

    scroll(true);
    expect(wrapper).toHaveAttribute("data-reveal", "shown");
    expect(wrapper).toHaveAttribute("data-active", "true");

    scroll(false);
    expect(wrapper).toHaveAttribute("data-active", "false");
  });

  it("stays shown once it has appeared, however far it is scrolled away", () => {
    render(<RevealOnView><span>x</span></RevealOnView>);
    const wrapper = screen.getByText("x").parentElement!;

    scroll(true);
    scroll(false);

    expect(wrapper).toHaveAttribute("data-reveal", "shown");
  });

  it("shows everything at once, with nothing waiting for a scroll, for a reader who prefers less motion", () => {
    stubMotion(true);
    render(<RevealOnView><span>x</span></RevealOnView>);

    expect(screen.getByText("x").parentElement).toHaveAttribute("data-reveal", "shown");
    expect(observed).toEqual([]);
  });

  it("shows everything at once where the browser cannot watch for scrolling", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<RevealOnView><span>x</span></RevealOnView>);

    expect(screen.getByText("x").parentElement).toHaveAttribute("data-reveal", "shown");
  });

  it("stops watching when it goes away", () => {
    const { unmount } = render(<RevealOnView><span>x</span></RevealOnView>);

    unmount();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
