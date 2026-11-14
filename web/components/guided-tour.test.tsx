// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
let pathname = "/dashboard";
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
}));

import { readTourStep, writeTourStep } from "@/lib/tour-state";
import { TOUR_STEPS } from "@/lib/tour-steps";
import { GuidedTour } from "./guided-tour";

let frames: FrameRequestCallback[] = [];
let phone = false;
let reduce = false;
/** Runs the animation frames asked for so far, once. */
function nextFrame() {
  const run = frames;
  frames = [];
  act(() => run.forEach((callback) => callback(0)));
}
function target(name: string, top: number) {
  const element = document.createElement("div");
  element.setAttribute("data-tour", name);
  element.getBoundingClientRect = () => ({ top, left: 20, width: 300, height: 120, right: 320, bottom: top + 120, x: 20, y: top, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(element);
  return element;
}

beforeEach(() => {
  phone = false;
  reduce = false;
  frames = [];
  document.body.innerHTML = "";
  pathname = "/dashboard";
  search = "";
  push.mockReset();
  window.sessionStorage.clear();
  window.matchMedia = ((query: string) => ({
    matches: query.includes("max-width") ? phone : query.includes("reduced-motion") ? reduce : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GuidedTour", () => {
  it("shows nothing on an ordinary visit", () => {
    render(<GuidedTour />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens on the first step when the address asks for it, and tidies the address", () => {
    search = "tour=1";
    window.history.replaceState(null, "", "/dashboard?tour=1");
    render(<GuidedTour />);

    expect(screen.getByRole("dialog", { name: "Welcome to Brief" })).toBeInTheDocument();
    expect(screen.getByText(`Step 1 of ${TOUR_STEPS.length}`)).toBeInTheDocument();
    expect(window.location.search).toBe("");
  });

  it("picks up where it was, after a refresh", () => {
    writeTourStep(2);
    render(<GuidedTour />);

    expect(screen.getByRole("heading", { name: TOUR_STEPS[2].title })).toBeInTheDocument();
  });

  it("does not take clicks away from the page underneath, so it is not a modal", () => {
    writeTourStep(0);
    render(<GuidedTour />);

    expect(screen.getByRole("dialog")).not.toHaveAttribute("aria-modal", "true");
    for (const layer of document.querySelectorAll("[aria-hidden=true].fixed")) expect(layer.className).toContain("pointer-events-none");
  });

  it("goes to the page a step belongs to when Next is pressed, and remembers the step", () => {
    writeTourStep(0);
    render(<GuidedTour />);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(push).toHaveBeenCalledWith("/dashboard/documents");
    expect(readTourStep(TOUR_STEPS.length)).toBe(1);
    expect(screen.getByRole("heading", { name: TOUR_STEPS[1].title })).toBeInTheDocument();
  });

  it("stays open when the person goes to another page themselves", () => {
    writeTourStep(1);
    pathname = "/dashboard/documents";
    const { rerender } = render(<GuidedTour />);

    pathname = "/dashboard/profile";
    rerender(<GuidedTour />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(readTourStep(TOUR_STEPS.length)).toBe(1);
  });

  it("offers a way back to the page a step is about when the person is somewhere else", () => {
    writeTourStep(1);
    pathname = "/dashboard/profile";
    render(<GuidedTour />);

    fireEvent.click(screen.getByRole("button", { name: "Show me" }));

    expect(push).toHaveBeenCalledWith("/dashboard/documents");
  });

  it("does not offer Show me when the person is already on the page", () => {
    writeTourStep(1);
    pathname = "/dashboard/documents";
    render(<GuidedTour />);

    expect(screen.queryByRole("button", { name: "Show me" })).not.toBeInTheDocument();
  });

  it("goes back a step with Back, and has no Back on the first", () => {
    writeTourStep(0);
    render(<GuidedTour />);
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(readTourStep(TOUR_STEPS.length)).toBe(0);
  });

  it("closes only when asked: Skip tour, Escape, or Done", () => {
    writeTourStep(0);
    const { unmount } = render(<GuidedTour />);
    fireEvent.click(screen.getByRole("button", { name: "Skip tour" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(readTourStep(TOUR_STEPS.length)).toBeNull();
    unmount();

    writeTourStep(0);
    const second = render(<GuidedTour />);
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    second.unmount();

    writeTourStep(TOUR_STEPS.length - 1);
    render(<GuidedTour />);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("points a highlight at the part of the page the step is about, and brings it smoothly into view once", () => {
    writeTourStep(1);
    pathname = "/dashboard/documents";
    target("upload", 600);
    render(<GuidedTour />);

    nextFrame();
    nextFrame();

    const spotlight = document.querySelector("[data-tour-spotlight]") as HTMLElement;
    expect(spotlight).not.toBeNull();
    expect(spotlight.style.top).toBe("592px");
    expect(spotlight.style.width).toBe("316px");
    expect(spotlight.style.transition).toContain("400ms");
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
    expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
    expect(document.querySelector("[data-tour-dim]")).toBeNull();
  });

  it("does not scroll when the part is already where it should be, and scrolls without animation for reduced motion", () => {
    writeTourStep(1);
    pathname = "/dashboard/documents";
    target("upload", 96);
    const { unmount } = render(<GuidedTour />);
    nextFrame();
    expect(window.scrollTo).not.toHaveBeenCalled();
    unmount();
    document.body.innerHTML = "";

    reduce = true;
    target("upload", 700);
    render(<GuidedTour />);
    nextFrame();
    expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }));
    expect((document.querySelector("[data-tour-spotlight]") as HTMLElement).style.transition).toBe("none");
  });

  it("brings the part nearer the top on a phone, where the card takes the bottom", () => {
    writeTourStep(1);
    pathname = "/dashboard/documents";
    phone = true;
    target("upload", 400);
    render(<GuidedTour />);

    nextFrame();

    expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: expect.any(Number) }));
    const top = (window.scrollTo as unknown as { mock: { calls: [{ top: number }][] } }).mock.calls[0][0].top;
    expect(top).toBe(window.scrollY + 400 - 72);
  });

  it("dims the page instead when the part cannot be found, and keeps looking for it", () => {
    writeTourStep(1);
    pathname = "/dashboard/documents";
    render(<GuidedTour />);

    nextFrame();
    expect(document.querySelector("[data-tour-spotlight]")).toBeNull();
    expect(document.querySelector("[data-tour-dim]")).not.toBeNull();

    target("upload", 300);
    nextFrame();
    expect(document.querySelector("[data-tour-spotlight]")).not.toBeNull();
  });

  it("shows the points under a step that has them, and Close on the last step", () => {
    writeTourStep(3);
    render(<GuidedTour />);
    expect(screen.getByText("Key terms, in plain words")).toBeInTheDocument();
    cleanup();

    writeTourStep(TOUR_STEPS.length - 1);
    render(<GuidedTour />);
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("says nothing of the highlight for a step with no part to point at", () => {
    writeTourStep(0);
    render(<GuidedTour />);
    nextFrame();

    expect(document.querySelector("[data-tour-spotlight]")).toBeNull();
  });
});
