// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

  it("scrolls the highlighted words into view, not the whole clause, and focuses the clause", () => {
    render(<ClauseViewer clauses={CLAUSES} activeCitation={{ clauseId: "c2", quote: "without penalty" }} />);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    // A long clause can be taller than the screen, so centering the clause could leave the
    // quoted words off screen. Centering the highlight always shows them.
    expect(scrollIntoView.mock.contexts[0]).toBe(document.querySelector("mark"));
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
    expect(scrollIntoView.mock.contexts[0]).toBe(clauseElement("c1"));
  });

  it("ignores a citation for a clause that isn't on the page", () => {
    render(<ClauseViewer clauses={CLAUSES} activeCitation={{ clauseId: "missing", quote: "anything" }} />);

    expect(document.querySelector("mark")).toBeNull();
    expect(document.querySelector("[aria-current]")).toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe("ClauseViewer headings", () => {
  beforeEach(() => stubReducedMotion(false));

  it("puts a level 2 heading for the document text before the level 3 page headings, so the outline has no gap", () => {
    render(<ClauseViewer clauses={CLAUSES} />);

    const headings = screen.getAllByRole("heading").map((heading) => [heading.tagName, heading.textContent]);

    expect(headings).toEqual([
      ["H2", "Document text"],
      ["H3", "Page 1"],
      ["H3", "Page 2"],
    ]);
  });

  it("keeps that heading out of sight, since the section is already labeled on screen by its pages", () => {
    render(<ClauseViewer clauses={CLAUSES} />);

    expect(screen.getByRole("heading", { level: 2, name: "Document text" })).toHaveClass("sr-only");
  });

  it("shows each page as one sheet: an ordered list of its clauses under one page label", () => {
    render(<ClauseViewer clauses={CLAUSES} />);

    const lists = screen.getAllByRole("list");
    expect(lists).toHaveLength(2);
    expect(within(lists[0]).getAllByRole("listitem")).toHaveLength(2);
    expect(within(lists[1]).getAllByRole("listitem")).toHaveLength(1);
  });

  it("marks the chosen clause with the accent edge, and leaves the others with an invisible one", () => {
    const { rerender } = render(<ClauseViewer clauses={CLAUSES} />);
    rerender(<ClauseViewer clauses={CLAUSES} activeCitation={{ clauseId: "c3", quote: "late fee" }} />);

    expect(clauseElement("c3").className).toContain("border-l-primary");
    expect(clauseElement("c1").className).toContain("border-l-transparent");
  });
});

describe("ClauseViewer find", () => {
  const FIND_CLAUSES: ClauseData[] = [
    { id: "f1", clause_index: 0, page_number: 1, text: "A late fee of fifty dollars applies. The late fee is due at once." },
    { id: "f2", clause_index: 1, page_number: 2, text: "There is no fee for paying early." },
    { id: "f3", clause_index: 2, page_number: 2, text: "Pay $1,450.00 (see clause (b)) at signing." },
  ];
  const box = () => screen.getByRole("searchbox", { name: "Find in this document" });
  const type = (value: string) => fireEvent.change(box(), { target: { value } });
  const status = () => screen.getByRole("status").textContent;
  const marks = () => Array.from(document.querySelectorAll("mark")).map((mark) => mark.textContent);

  beforeEach(() => stubReducedMotion(false));

  it("shows nothing marked, and no count, until something is typed", () => {
    render(<ClauseViewer clauses={FIND_CLAUSES} />);

    expect(marks()).toEqual([]);
    expect(status()).toBe("");
  });

  it("marks every match across the whole document, says which one the reader is on, and starts at the first", () => {
    render(<ClauseViewer clauses={FIND_CLAUSES} />);

    type("fee");

    expect(marks()).toEqual(["fee", "fee", "fee"]);
    expect(status()).toBe("1 of 3");
    expect(document.querySelectorAll('[data-find-current="true"]')).toHaveLength(1);
    expect(within(clauseElement("f1")).getAllByText("fee")[0]).toHaveAttribute("data-find-current", "true");
  });

  it("steps to the next and previous match, wrapping round, and scrolls each into the middle of the view", () => {
    render(<ClauseViewer clauses={FIND_CLAUSES} />);
    type("fee");
    scrollIntoView.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Next match" }));
    expect(status()).toBe("2 of 3");
    expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: "smooth", block: "center" });
    fireEvent.click(screen.getByRole("button", { name: "Next match" }));
    fireEvent.click(screen.getByRole("button", { name: "Next match" }));
    expect(status()).toBe("1 of 3");
    fireEvent.click(screen.getByRole("button", { name: "Previous match" }));
    expect(status()).toBe("3 of 3");
    expect(within(clauseElement("f2")).getByText("fee")).toHaveAttribute("data-find-current", "true");
  });

  it("uses Enter for the next match, Shift and Enter for the previous one, and Escape to clear", () => {
    render(<ClauseViewer clauses={FIND_CLAUSES} />);
    type("fee");

    fireEvent.keyDown(box(), { key: "Enter" });
    expect(status()).toBe("2 of 3");
    fireEvent.keyDown(box(), { key: "Enter", shiftKey: true });
    expect(status()).toBe("1 of 3");
    fireEvent.keyDown(box(), { key: "Escape" });
    expect(box()).toHaveValue("");
    expect(marks()).toEqual([]);
  });

  it("says when there are no matches, and disables the step buttons", () => {
    render(<ClauseViewer clauses={FIND_CLAUSES} />);

    type("zebra");

    expect(status()).toBe("No matches");
    expect(screen.getByRole("button", { name: "Next match" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous match" })).toBeDisabled();
  });

  it("finds figures and brackets exactly as typed, and ignores case", () => {
    render(<ClauseViewer clauses={FIND_CLAUSES} />);

    type("$1,450.00");
    expect(marks()).toEqual(["$1,450.00"]);
    type("(B)");
    expect(marks()).toEqual(["(b)"]);
  });

  it("starts again at the first match when the search changes", () => {
    render(<ClauseViewer clauses={FIND_CLAUSES} />);
    type("fee");
    fireEvent.click(screen.getByRole("button", { name: "Next match" }));

    type("late fee");

    expect(status()).toBe("1 of 2");
  });

  it("does not search for a single letter", () => {
    render(<ClauseViewer clauses={FIND_CLAUSES} />);

    type("a");

    expect(marks()).toEqual([]);
    expect(status()).toBe("");
  });

  it("gives way to the cited quote highlight again once the search is cleared", () => {
    const { rerender } = render(<ClauseViewer clauses={FIND_CLAUSES} />);
    rerender(<ClauseViewer clauses={FIND_CLAUSES} activeCitation={{ clauseId: "f2", quote: "paying early" }} />);
    expect(marks()).toEqual(["paying early"]);

    type("fee");
    expect(marks()).toEqual(["fee", "fee", "fee"]);

    type("");
    expect(marks()).toEqual(["paying early"]);
  });
});
