// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { askQuestion, type AskResult } from "@/lib/ask";
import type { ClauseData } from "@/lib/documents";
import { DocumentWorkspace } from "./document-workspace";

vi.mock("@/lib/ask", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ask")>();
  return { ...actual, askQuestion: vi.fn() };
});

const askMock = vi.mocked(askQuestion);

const CLAUSES: ClauseData[] = [
  { id: "clause-a", clause_index: 0, page_number: 1, text: "Interest accrues at six percent per year." },
  {
    id: "clause-b",
    clause_index: 1,
    page_number: 2,
    text: "The borrower may prepay at any time without penalty.",
  },
  { id: "clause-c", clause_index: 2, page_number: 2, text: "A late fee of fifty dollars applies." },
];

const ANSWER: AskResult = {
  found: true,
  answer: "Yes you can pay early, and late payments cost a fee.",
  citations: [
    {
      clause_id: "clause-b",
      page_number: 2,
      clause_text: CLAUSES[1].text,
      quote: "without penalty",
    },
    {
      clause_id: "clause-c",
      page_number: 2,
      clause_text: CLAUSES[2].text,
      quote: "late fee of fifty dollars",
    },
  ],
};

let scrollIntoView: Mock;

function clauseElement(id: string): HTMLElement {
  const element = document.getElementById(`clause-${id}`);
  if (!element) throw new Error(`no clause element for ${id}`);
  return element;
}

beforeEach(() => {
  scrollIntoView = vi.fn();
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    value: scrollIntoView,
    configurable: true,
  });
  Object.defineProperty(Element.prototype, "scrollTo", { value: vi.fn(), configurable: true });
  Object.defineProperty(window, "matchMedia", {
    value: vi.fn().mockReturnValue({ matches: false }),
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function askAndGetAnswer() {
  askMock.mockResolvedValue({ ok: true, result: ANSWER });
  const user = userEvent.setup();
  render(<DocumentWorkspace documentId="doc-1" clauses={CLAUSES} />);
  await user.type(screen.getByLabelText("Your question"), "Can I pay early?{Enter}");
  await screen.findByText(ANSWER.answer);
  return user;
}

describe("DocumentWorkspace", () => {
  it("shows the chat and the document together with nothing highlighted yet", () => {
    render(<DocumentWorkspace documentId="doc-1" clauses={CLAUSES} />);

    expect(screen.getByRole("region", { name: "Ask about this document" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Document text" })).toBeInTheDocument();
    expect(document.querySelector("mark")).toBeNull();
  });

  it("jumps to and highlights the cited clause when a citation is clicked", async () => {
    const user = await askAndGetAnswer();

    await user.click(screen.getByRole("button", { name: /without penalty/ }));

    const clause = clauseElement("clause-b");
    expect(clause).toHaveAttribute("aria-current", "true");
    const highlighted = within(clause).getByText("without penalty");
    expect(highlighted.tagName).toBe("MARK");
    expect(scrollIntoView.mock.contexts[0]).toBe(highlighted);
    expect(clauseElement("clause-a")).not.toHaveAttribute("aria-current");
  });

  it("moves the highlight to a different clause when another citation is clicked", async () => {
    const user = await askAndGetAnswer();

    await user.click(screen.getByRole("button", { name: /without penalty/ }));
    await user.click(screen.getByRole("button", { name: /late fee of fifty dollars/ }));

    expect(clauseElement("clause-b")).not.toHaveAttribute("aria-current");
    expect(clauseElement("clause-c")).toHaveAttribute("aria-current", "true");
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it("scrolls again when the same citation is clicked a second time", async () => {
    const user = await askAndGetAnswer();
    const citation = screen.getByRole("button", { name: /without penalty/ });

    await user.click(citation);
    await user.click(citation);

    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });
});
