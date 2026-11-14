// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { AdminDay } from "@/lib/admin";
import { Funnel, labelIndexes, LineChart, niceMax, Sparkline } from "./charts";

afterEach(cleanup);

const day = (label: string, fields: Partial<AdminDay> = {}): AdminDay => ({ day: label, signed_up: 0, people: 0, visits: 0, minutes: 0, documents: 0, questions: 0, reads: 0, overviews: 0, demo_opened: 0, demo_finished: 0, ...fields });
const days = [day("2026-11-10", { people: 2, signed_up: 1 }), day("2026-11-11", { people: 5 }), day("2026-11-12", { people: 3, signed_up: 2 })];

describe("niceMax", () => {
  it.each([
    [0, 4],
    [3, 4],
    [4.7, 5],
    [9, 10],
    [11, 20],
    [23, 25],
    [48, 50],
    [51, 100],
    [820, 1000],
  ])("tops the scale for %s at %s, a round number", (value, top) => {
    expect(niceMax(value)).toBe(top);
  });
});

describe("labelIndexes", () => {
  it("names every day of a short stretch, and about five of a long one, always including the first and the last", () => {
    expect(labelIndexes(1)).toEqual([0]);
    expect(labelIndexes(3)).toEqual([0, 1, 2]);
    expect(labelIndexes(30)).toEqual([0, 7, 15, 22, 29]);
    expect(labelIndexes(90)[0]).toBe(0);
    expect(labelIndexes(90).at(-1)).toBe(89);
  });
});

describe("LineChart", () => {
  it("is a picture with a name that says how many days it covers", () => {
    render(<LineChart title="People using Brief" days={days} unit="people" lines={[{ label: "Active people", pick: (d) => d.people, color: "#4f46e5" }]} />);

    expect(screen.getByRole("img", { name: "People using Brief, over 3 days" })).toBeInTheDocument();
  });

  it("names its lines with their totals, so the colours need no guessing", () => {
    render(
      <LineChart
        title="People"
        days={days}
        unit="people"
        lines={[
          { label: "Active people", pick: (d) => d.people, color: "#4f46e5" },
          { label: "New sign-ups", pick: (d) => d.signed_up, color: "#0d9488" },
        ]}
      />,
    );

    expect(screen.getByText("Active people").parentElement).toHaveTextContent("Active people 10");
    expect(screen.getByText("New sign-ups").parentElement).toHaveTextContent("New sign-ups 3");
  });

  it("carries each day's numbers as a tooltip and as a table for a screen reader", () => {
    const { container } = render(
      <LineChart title="People" days={days} unit="people" lines={[{ label: "Active people", pick: (d) => d.people, color: "#4f46e5" }]} />,
    );

    expect(Array.from(container.querySelectorAll("title")).map((t) => t.textContent)).toContain("Nov 11: 5 active people");
    const rows = within(screen.getByRole("table", { name: "People" })).getAllByRole("row");
    expect(rows).toHaveLength(4);
    expect(within(rows[2]).getByRole("rowheader")).toHaveTextContent("Nov 11");
    expect(within(rows[2]).getByRole("cell")).toHaveTextContent("5");
  });

  it("draws a flat chart of nothing without breaking, and a single day", () => {
    const { container, rerender } = render(<LineChart title="Nothing" days={[day("2026-11-10"), day("2026-11-11")]} unit="x" lines={[{ label: "None", pick: (d) => d.people, color: "red" }]} />);
    expect(container.querySelector("path")).not.toBeNull();

    rerender(<LineChart title="One" days={[day("2026-11-10", { people: 4 })]} unit="x" lines={[{ label: "One", pick: (d) => d.people, color: "red" }]} note="A note under the title." />);
    expect(screen.getByText("A note under the title.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "One, over 1 days" })).toBeInTheDocument();
  });

  it("marks each day with a dot for a stretch of a month or less, and leaves them off a long one", () => {
    const short = render(<LineChart title="Short" days={days} unit="x" lines={[{ label: "A", pick: (d) => d.people, color: "red" }]} />);
    expect(short.container.querySelectorAll("circle")).toHaveLength(3);
    short.unmount();

    const long = Array.from({ length: 90 }, (_, i) => day(`2026-${String(Math.floor(i / 30) + 8).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`, { people: i % 5 }));
    const many = render(<LineChart title="Long" days={long} unit="x" lines={[{ label: "A", pick: (d) => d.people, color: "red" }]} />);
    expect(many.container.querySelectorAll("circle")).toHaveLength(0);
  });
});

describe("Sparkline", () => {
  it("is only a shape, hidden from a screen reader", () => {
    const { container } = render(<Sparkline values={[1, 3, 2]} />);

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("polyline")?.getAttribute("points")?.split(" ")).toHaveLength(3);
  });

  it("copes with no days and with all zeros", () => {
    expect(render(<Sparkline values={[]} />).container.querySelector("polyline")).not.toBeNull();
    expect(render(<Sparkline values={[0, 0]} />).container.querySelector("polyline")).not.toBeNull();
  });
});

describe("Funnel", () => {
  it("shows each step with how many reached it and its share of the step before", () => {
    render(<Funnel label="Steps" steps={[{ name: "Signed up", count: 10 }, { name: "Uploaded", count: 5 }, { name: "Asked", count: 0 }]} />);

    const steps = within(screen.getByRole("list", { name: "Steps" })).getAllByRole("listitem");
    expect(steps[0]).toHaveTextContent("Signed up10");
    expect(steps[1]).toHaveTextContent("Uploaded5 · 50% of the step before");
    expect(steps[2]).toHaveTextContent("Asked0 · 0% of the step before");
  });

  it("says none when there was nothing in the step before, and copes with no steps", () => {
    render(<Funnel label="Empty steps" steps={[{ name: "A", count: 0 }, { name: "B", count: 0 }]} />);
    expect(screen.getByRole("list", { name: "Empty steps" }).children[1]).toHaveTextContent("none of the step before");
    cleanup();

    render(<Funnel label="Nothing at all" steps={[]} />);
    expect(screen.getByRole("list", { name: "Nothing at all" })).toBeEmptyDOMElement();
  });
});
