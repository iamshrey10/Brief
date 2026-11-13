// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TOUR_STEPS, TOUR_URL } from "@/lib/tour-steps";
import { FirstTimeTour } from "./first-time-tour";

beforeEach(() => {
  window.history.replaceState(null, "", "/dashboard?tour=1");
});
afterEach(cleanup);

describe("FirstTimeTour", () => {
  it("shows nothing unless the address asks for it", () => {
    render(<FirstTimeTour start={false} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens on the first card as a dialog named by its title, with the step count", () => {
    render(<FirstTimeTour start />);

    expect(screen.getByRole("dialog", { name: "Welcome to Brief" })).toBeInTheDocument();
    expect(screen.getByText(`Step 1 of ${TOUR_STEPS.length}`)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  });

  it("walks through every card with Next and Back, covering the sample lease, overview, ask, sharing, bin and two-step", () => {
    render(<FirstTimeTour start />);

    for (const step of TOUR_STEPS) {
      expect(screen.getByRole("heading", { name: step.title })).toBeInTheDocument();
      if (step !== TOUR_STEPS[TOUR_STEPS.length - 1]) fireEvent.click(screen.getByRole("button", { name: "Next" }));
    }
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    expect(screen.getByText(/take this tour again any time from Profile/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: TOUR_STEPS[TOUR_STEPS.length - 2].title })).toBeInTheDocument();
  });

  it("tells about each part of Brief", () => {
    const text = TOUR_STEPS.map((s) => `${s.title} ${s.body} ${(s.points ?? []).join(" ")}`).join(" ");

    for (const part of ["sample lease", "Key terms", "Key dates", "Before you sign", "Ask", "Share your dashboard", "90 days", "Bin", "7 days", "Two-step"]) {
      expect(text).toContain(part);
    }
  });

  it("closes with Skip tour and cleans the address so a refresh does not bring it back", () => {
    render(<FirstTimeTour start />);

    fireEvent.click(screen.getByRole("button", { name: "Skip tour" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(window.location.search).toBe("");
  });

  it("closes with the Escape key", () => {
    render(<FirstTimeTour start />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes with Done on the last card", () => {
    render(<FirstTimeTour start />);
    for (let i = 0; i < TOUR_STEPS.length - 1; i++) fireEvent.click(screen.getByRole("button", { name: "Next" }));

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers a button on a card that goes to the place it describes, and closes the tour", () => {
    render(<FirstTimeTour start />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    const link = screen.getByRole("link", { name: "Go to Documents" });
    expect(link).toHaveAttribute("href", "/dashboard/documents");
    fireEvent.click(link);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps Tab inside the card", () => {
    render(<FirstTimeTour start />);
    const done = screen.getByRole("button", { name: "Next" });
    done.focus();

    fireEvent.keyDown(done, { key: "Tab" });

    expect(screen.getByRole("button", { name: "Skip tour" })).toHaveFocus();
  });

  it("is reached from the address the welcome page and Profile use", () => {
    expect(TOUR_URL).toBe("/dashboard?tour=1");
    vi.restoreAllMocks();
  });
});
