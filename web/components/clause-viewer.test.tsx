// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { ClauseData } from "@/lib/documents";
import { ClauseViewer } from "./clause-viewer";

const CLAUSES: ClauseData[] = [
  { id: "c1", clause_index: 0, page_number: 1, text: "Interest accrues at six percent per year." },
  {
    id: "c2",
    clause_index: 1,
    page_number: 1,
    text: "The borrower may prepay at any time\nwithout penalty.",
  },
  { id: "c3", clause_index: 2, page_number: 2, text: "A late fee of fifty dollars applies." },
];

let scrollIntoView: Mock;

function stubReducedMotion(reduce: boolean) {
  Object.defineProperty(window, "matchMedia", {
    value: vi.fn().mockReturnValue({ matches: reduce }),
    configurable: true,
    writable: true,
  });
}

function clauseElement(id: string): HTMLElement {
  const element = document.getElementById(`clause-${id}`);
  if (!element) throw new Error(`no clause element for ${id}`);
  return element;
}

beforeEach(() => {
  scrollIntoView = vi.fn();
  // jsdom doesn't implement scrolling, so record the calls instead.
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    value: scrollIntoView,
    configurable: true,
  });
  stubReducedMotion(false);
});

afterEach(cleanup);

describe("ClauseViewer", () => {
  it("groups clauses under their page headings", () => {
    render(<ClauseViewer clauses={CLAUSES} />);

    expect(screen.getByRole("heading", { name: "Page 1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Page 2" })).toBeInTheDocument();
    expect(screen.getByText("Interest accrues at six percent per year.")).toBeInTheDocument();
    expect(screen.getByText("A late fee of fifty dollars applies.")).toBeInTheDocument();
  });

  it("shows plain text and does not scroll when nothing is selected", () => {
    render(<ClauseViewer clauses={CLAUSES} />);

    expect(document.querySelector("mark")).toBeNull();
    expect(document.querySelector("[aria-current]")).toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("highlights the quoted words inside the chosen clause and nowhere else", () => {
    render(<ClauseViewer clauses={CLAUSES} activeCitation={{ clauseId: "c2", quote: "without penalty" }} />);

    const marks = document.querySelectorAll("mark");
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe("without penalty");
    expect(clauseElement("c2")).toContainElement(marks[0] as HTMLElement);
    expect(clauseElement("c1").querySelector("mark")).toBeNull();
  });

  it("marks the chosen clause as the current one", () => {
    render(<ClauseViewer clauses={CLAUSES} activeCitation={{ clauseId: "c2", quote: "without penalty" }} />);

    expect(clauseElement("c2")).toHaveAttribute("aria-current", "true");
    expect(clauseElement("c1")).not.toHaveAttribute("aria-current");
  });

  it("scrolls the chosen clause into view and moves keyboard focus to it", () => {
    render(<ClauseViewer clauses={CLAUSES} activeCitation={{ clauseId: "c2", quote: "without penalty" }} />);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    expect(scrollIntoView.mock.contexts[0]).toBe(clauseElement("c2"));
    expect(document.activeElement).toBe(clauseElement("c2"));
  });

  it("scrolls instantly for people who prefer reduced motion", () => {
    stubReducedMotion(true);

    render(<ClauseViewer clauses={CLAUSES} activeCitation={{ clauseId: "c2", quote: "without penalty" }} />);

    expect(window.matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "center" });
  });

  it("scrolls again when the same citation is chosen a second time", () => {
    const { rerender } = render(
      <ClauseViewer clauses={CLAUSES} activeCitation={{ clauseId: "c2", quote: "without penalty" }} />,
    );

    rerender(
      <ClauseViewer clauses={CLAUSES} activeCitation={{ clauseId: "c2", quote: "without penalty" }} />,
    );

    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it("moves the highlight when a different citation is chosen", () => {
    const { rerender } = render(
      <ClauseViewer clauses={CLAUSES} activeCitation={{ clauseId: "c2", quote: "without penalty" }} />,
    );

    rerender(
      <ClauseViewer clauses={CLAUSES} activeCitation={{ clauseId: "c3", quote: "late fee" }} />,
    );

    expect(clauseElement("c2")).not.toHaveAttribute("aria-current");
    expect(clauseElement("c2").querySelector("mark")).toBeNull();
    expect(clauseElement("c3")).toHaveAttribute("aria-current", "true");
    expect(clauseElement("c3").querySelector("mark")?.textContent).toBe("late fee");
  });

  it("still brings the clause into view when its quote can't be located inside it", () => {
    render(<ClauseViewer clauses={CLAUSES} activeCitation={{ clauseId: "c1", quote: "not in this clause" }} />);

    expect(clauseElement("c1")).toHaveAttribute("aria-current", "true");
    expect(document.querySelector("mark")).toBeNull();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("ignores a citation for a clause that isn't on the page", () => {
    render(<ClauseViewer clauses={CLAUSES} activeCitation={{ clauseId: "missing", quote: "anything" }} />);

    expect(document.querySelector("mark")).toBeNull();
    expect(document.querySelector("[aria-current]")).toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
