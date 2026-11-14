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

beforeEach(() => {
  pathname = "/dashboard";
  search = "";
  push.mockReset();
  window.sessionStorage.clear();
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  vi.stubGlobal("requestAnimationFrame", () => 0);
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
});
