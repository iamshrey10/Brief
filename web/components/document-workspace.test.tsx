// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { askQuestion, type AskResult } from "@/lib/ask";
import type { ClauseData } from "@/lib/documents";
import {
  fetchChecklist,
  fetchKeyTerms,
  type ChecklistResult,
  type KeyTermsResult,
} from "@/lib/overview";
import { DocumentWorkspace } from "./document-workspace";

vi.mock("@/lib/ask", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ask")>();
  return { ...actual, askQuestion: vi.fn() };
});

vi.mock("@/lib/overview", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/overview")>();
  return { ...actual, fetchKeyTerms: vi.fn(), fetchChecklist: vi.fn() };
});

const askMock = vi.mocked(askQuestion);
const keyTermsMock = vi.mocked(fetchKeyTerms);
const checklistMock = vi.mocked(fetchChecklist);

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

const KEY_TERMS: KeyTermsResult = {
  terms: [
    {
      name: "interest_rate",
      label: "Interest rate",
      found: true,
      value: "6% a year",
      clause_id: "clause-a",
      page_number: 1,
      quote: "six percent per year",
    },
  ],
  truncated: false,
};

const CHECKLIST: ChecklistResult = {
  answers: [
    {
      id: "prepayment",
      question: "Can I pay this off early?",
      why_it_matters: "w",
      importance: "high",
      status: "answered",
      answer: "Yes, with no penalty.",
      evidence: [{ clause_id: "clause-b", page_number: 2, quote: "without penalty" }],
      gap: false,
      ask_them: null,
    },
  ],
  truncated: false,
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
  keyTermsMock.mockResolvedValue({ ok: true, result: KEY_TERMS });
  checklistMock.mockResolvedValue({ ok: true, result: CHECKLIST });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWorkspace() {
  const user = userEvent.setup();
  render(<DocumentWorkspace documentId="doc-1" clauses={CLAUSES} />);
  return user;
}

async function openAskTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("tab", { name: "Ask" }));
}

async function askAndGetAnswer() {
  askMock.mockResolvedValue({ ok: true, result: ANSWER });
  const user = renderWorkspace();
  await openAskTab(user);
  await user.type(screen.getByLabelText("Your question"), "Can I pay early?{Enter}");
  await screen.findByText(ANSWER.answer);
  return user;
}

describe("DocumentWorkspace tabs", () => {
  it("opens on the overview with the document beside it and nothing highlighted yet", async () => {
    renderWorkspace();

    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("region", { name: "Overview" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Document text" })).toBeInTheDocument();
    expect(screen.getByLabelText("Your question")).not.toBeVisible();
    expect(document.querySelector("mark")).toBeNull();
  });

  it("switches to the chat when Ask is chosen, and back", async () => {
    const user = renderWorkspace();

    await openAskTab(user);
    expect(screen.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Your question")).toBeVisible();
    expect(screen.getByRole("region", { name: "Overview", hidden: true })).not.toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Overview" }));
    expect(screen.getByRole("region", { name: "Overview" })).toBeVisible();
    expect(screen.getByLabelText("Your question")).not.toBeVisible();
  });

  it("connects each tab to its panel for assistive technology", () => {
    renderWorkspace();

    const overviewTab = screen.getByRole("tab", { name: "Overview" });
    expect(overviewTab).toHaveAttribute("aria-controls", "panel-overview");
    expect(document.getElementById("panel-overview")).toHaveAttribute("aria-labelledby", "tab-overview");
    expect(document.getElementById("panel-ask")).toHaveAttribute("aria-labelledby", "tab-ask");
    expect(document.getElementById("panel-ask")).toHaveAttribute("hidden");
  });

  it("lets only the selected tab take focus with Tab", () => {
    renderWorkspace();

    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Ask" })).toHaveAttribute("tabindex", "-1");
  });

  it("moves between the tabs with the arrow keys and focuses the one it moved to", async () => {
    const user = renderWorkspace();
    screen.getByRole("tab", { name: "Overview" }).focus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Ask" })).toHaveFocus();

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveFocus();
  });

  it("keeps the conversation when moving between tabs", async () => {
    const user = await askAndGetAnswer();

    await user.click(screen.getByRole("tab", { name: "Overview" }));
    await openAskTab(user);

    expect(screen.getByText(ANSWER.answer)).toBeVisible();
    expect(askMock).toHaveBeenCalledTimes(1);
  });

  it("does not read the document again when moving between tabs", async () => {
    const user = renderWorkspace();
    await screen.findByText("6% a year");

    await openAskTab(user);
    await user.click(screen.getByRole("tab", { name: "Overview" }));

    expect(keyTermsMock).toHaveBeenCalledTimes(1);
    expect(checklistMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("6% a year")).toBeVisible();
  });
});

describe("DocumentWorkspace jumping to the document from the overview", () => {
  it("highlights the clause and quote behind a key term", async () => {
    const user = renderWorkspace();

    await user.click(await screen.findByRole("button", { name: /Interest rate.*page 1/i }));

    const clause = clauseElement("clause-a");
    expect(clause).toHaveAttribute("aria-current", "true");
    const highlighted = within(clause).getByText("six percent per year");
    expect(highlighted.tagName).toBe("MARK");
    expect(scrollIntoView.mock.contexts[0]).toBe(highlighted);
  });

  it("highlights the clause and quote behind a checklist answer", async () => {
    const user = renderWorkspace();

    await user.click(await screen.findByRole("button", { name: /Can I pay this off early.*page 2/i }));

    expect(clauseElement("clause-b")).toHaveAttribute("aria-current", "true");
    expect(within(clauseElement("clause-b")).getByText("without penalty").tagName).toBe("MARK");
  });

  it("scrolls again when the same evidence is clicked a second time", async () => {
    const user = renderWorkspace();
    const button = await screen.findByRole("button", { name: /Interest rate.*page 1/i });

    await user.click(button);
    await user.click(button);

    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it("stays on the overview after jumping, so the reader keeps their place", async () => {
    const user = renderWorkspace();

    await user.click(await screen.findByRole("button", { name: /Interest rate.*page 1/i }));

    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("DocumentWorkspace chat citations", () => {
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
