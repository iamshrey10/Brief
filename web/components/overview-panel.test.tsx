// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchChecklist,
  fetchKeyTerms,
  type ChecklistAnswer,
  type ChecklistResult,
  type KeyTerm,
  type KeyTermsResult,
} from "@/lib/overview";
import { OverviewPanel } from "./overview-panel";

vi.mock("@/lib/overview", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/overview")>();
  return { ...actual, fetchKeyTerms: vi.fn(), fetchChecklist: vi.fn() };
});

const keyTermsMock = vi.mocked(fetchKeyTerms);
const checklistMock = vi.mocked(fetchChecklist);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const FOUND_TERM = (name: string, label: string, value: string, page = 1): KeyTerm => ({
  name,
  label,
  found: true,
  value,
  clause_id: `clause-${name}`,
  page_number: page,
  quote: `${label} quote`,
});

const MISSING_TERM = (name: string, label: string): KeyTerm => ({
  name,
  label,
  found: false,
  value: null,
  clause_id: null,
  page_number: null,
  quote: null,
});

const KEY_TERMS: KeyTermsResult = {
  terms: [
    FOUND_TERM("interest_rate", "Interest rate", "6.8% variable"),
    FOUND_TERM("late_fee", "Late fee", "4% after 10 days", 2),
    MISSING_TERM("lender", "Lender"),
  ],
  truncated: false,
};

const GAP: ChecklistAnswer = {
  id: "prepayment",
  question: "Can I pay this loan off early?",
  why_it_matters: "Some loans charge a fee for paying early.",
  importance: "high",
  status: "not_mentioned",
  answer: null,
  evidence: [],
  gap: true,
  ask_them: "Is there any fee if I pay the loan off early?",
};

const ANSWERED: ChecklistAnswer = {
  id: "interest_rate",
  question: "What is the interest rate?",
  why_it_matters: "w",
  importance: "high",
  status: "answered",
  answer: "A variable rate, 30-day SOFR plus 4.25%.",
  evidence: [
    { clause_id: "clause-rate", page_number: 1, quote: "variable annual rate equal to the 30-day average SOFR" },
    { clause_id: "clause-cap", page_number: 2, quote: "will never exceed 11.95% per year" },
  ],
  gap: false,
  ask_them: null,
};

const QUIET: ChecklistAnswer = {
  id: "cosigner",
  question: "Is there a cosigner?",
  why_it_matters: "w",
  importance: "medium",
  status: "not_mentioned",
  answer: null,
  evidence: [],
  gap: false,
  ask_them: "Who else would be responsible for this loan?",
};

const CHECKLIST: ChecklistResult = { answers: [ANSWERED, QUIET, GAP], truncated: false };

function setup(onCitationSelect = vi.fn()) {
  keyTermsMock.mockResolvedValue({ ok: true, result: KEY_TERMS });
  checklistMock.mockResolvedValue({ ok: true, result: CHECKLIST });
  const user = userEvent.setup();
  render(<OverviewPanel documentId="doc-1" onCitationSelect={onCitationSelect} />);
  return { user, onCitationSelect };
}

describe("OverviewPanel loading", () => {
  it("shows a calm loading message in each section while the document is being read", () => {
    keyTermsMock.mockReturnValue(new Promise(() => {}));
    checklistMock.mockReturnValue(new Promise(() => {}));

    render(<OverviewPanel documentId="doc-1" onCitationSelect={vi.fn()} />);

    expect(screen.getByText(/reading your document/i)).toBeInTheDocument();
    expect(screen.getByText(/questions people most often miss/i)).toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(2);
  });

  it("asks for both things for the document it was given", () => {
    setup();

    expect(keyTermsMock).toHaveBeenCalledWith("doc-1");
    expect(checklistMock).toHaveBeenCalledWith("doc-1");
  });

  it("says plainly that it explains the document and is not legal advice", async () => {
    setup();

    expect(await screen.findByText(/not legal advice/i)).toBeInTheDocument();
  });
});

describe("OverviewPanel key terms", () => {
  it("shows each found term with its value and how many were found", async () => {
    setup();

    const section = await screen.findByRole("region", { name: "Key terms" });
    expect(within(section).getByText("Interest rate")).toBeInTheDocument();
    expect(within(section).getByText("6.8% variable")).toBeInTheDocument();
    expect(within(section).getByText("4% after 10 days")).toBeInTheDocument();
    expect(within(section).getByText("2 of 3 found")).toBeInTheDocument();
  });

  it("keeps terms the document does not state out of the main list, in a collapsed note", async () => {
    setup();

    const section = await screen.findByRole("region", { name: "Key terms" });
    const summary = within(section).getByText("Not mentioned in this document (1)");
    const details = summary.closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(within(details as HTMLElement).getByText("Lender")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").some((li) => li.textContent === "Lender")).toBe(true);
    // and the Lender term is not shown as a card with a value
    expect(within(section).queryByText("null")).not.toBeInTheDocument();
  });

  it("jumps to the clause and quote when a term's page is clicked", async () => {
    const { user, onCitationSelect } = setup();

    const section = await screen.findByRole("region", { name: "Key terms" });
    await user.click(within(section).getByRole("button", { name: /Interest rate.*page 1/i }));

    expect(onCitationSelect).toHaveBeenCalledWith({
      clauseId: "clause-interest_rate",
      quote: "Interest rate quote",
    });
  });

  it("shows the right page on each term", async () => {
    setup();

    const section = await screen.findByRole("region", { name: "Key terms" });
    expect(within(section).getByRole("button", { name: /Late fee.*page 2/i })).toBeInTheDocument();
  });

  it("says so when none of the usual terms are stated", async () => {
    keyTermsMock.mockResolvedValue({
      ok: true,
      result: { terms: [MISSING_TERM("a", "Lender")], truncated: false },
    });
    checklistMock.mockResolvedValue({ ok: true, result: CHECKLIST });

    render(<OverviewPanel documentId="doc-1" onCitationSelect={vi.fn()} />);

    expect(await screen.findByText(/none of the usual key terms/i)).toBeInTheDocument();
  });

  it("warns when the document was too long to read in full", async () => {
    keyTermsMock.mockResolvedValue({ ok: true, result: { ...KEY_TERMS, truncated: true } });
    checklistMock.mockResolvedValue({ ok: true, result: CHECKLIST });

    render(<OverviewPanel documentId="doc-1" onCitationSelect={vi.fn()} />);

    const section = await screen.findByRole("region", { name: "Key terms" });
    expect(within(section).getByText(/too long to read in full/i)).toBeInTheDocument();
  });
});

describe("OverviewPanel checklist", () => {
  it("lists what the document does not say before what it does say", async () => {
    setup();

    const section = await screen.findByRole("region", { name: "Before you sign" });
    const worth = within(section).getByRole("heading", { name: "Worth asking about" });
    const says = within(section).getByRole("heading", { name: "What the document says" });
    expect(worth.compareDocumentPosition(says) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("counts what was answered and what the document leaves out", async () => {
    setup();

    const section = await screen.findByRole("region", { name: "Before you sign" });
    expect(within(section).getByText("1 answered, 1 the document doesn't say")).toBeInTheDocument();
  });

  it("does not mention gaps in the count when there are none", async () => {
    keyTermsMock.mockResolvedValue({ ok: true, result: KEY_TERMS });
    checklistMock.mockResolvedValue({ ok: true, result: { answers: [ANSWERED], truncated: false } });

    render(<OverviewPanel documentId="doc-1" onCitationSelect={vi.fn()} />);

    expect(await screen.findByText("1 answered")).toBeInTheDocument();
  });

  it("shows a gap with why it matters and the wording for asking the other side", async () => {
    setup();

    const section = await screen.findByRole("region", { name: "Before you sign" });
    expect(within(section).getByText("Can I pay this loan off early?")).toBeInTheDocument();
    expect(within(section).getByText("The document doesn't say.")).toBeInTheDocument();
    expect(within(section).getByText("Some loans charge a fee for paying early.")).toBeInTheDocument();
    expect(
      within(section).getByText(/Is there any fee if I pay the loan off early\?/),
    ).toBeInTheDocument();
  });

  it("copies the wording for asking the other side", async () => {
    const { user } = setup();

    const button = await screen.findByRole("button", {
      name: "Copy the wording for: Can I pay this loan off early?",
    });
    await user.click(button);

    expect(await navigator.clipboard.readText()).toBe("Is there any fee if I pay the loan off early?");
    expect(button).toHaveTextContent("Copied");
  });

  it("says so when copying is blocked, instead of looking like nothing happened", async () => {
    const { user } = setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("blocked"));

    const button = await screen.findByRole("button", {
      name: "Copy the wording for: Can I pay this loan off early?",
    });
    await user.click(button);

    await waitFor(() => expect(button).toHaveTextContent("Couldn't copy"));
  });

  it("shows an answered question with its answer and each quote with its page", async () => {
    setup();

    const section = await screen.findByRole("region", { name: "Before you sign" });
    expect(within(section).getByText("A variable rate, 30-day SOFR plus 4.25%.")).toBeInTheDocument();
    expect(within(section).getByText(/30-day average SOFR/)).toBeInTheDocument();
    expect(within(section).getByText(/never exceed 11.95%/)).toBeInTheDocument();
  });

  it("jumps to the right clause and quote for each piece of evidence", async () => {
    const { user, onCitationSelect } = setup();

    const section = await screen.findByRole("region", { name: "Before you sign" });
    const buttons = within(section).getAllByRole("button", { name: /What is the interest rate/i });
    expect(buttons).toHaveLength(2);

    await user.click(buttons[1]);

    expect(onCitationSelect).toHaveBeenCalledWith({
      clauseId: "clause-cap",
      quote: "will never exceed 11.95% per year",
    });
  });

  it("keeps the less important silences collapsed, each with wording to ask", async () => {
    setup();

    const section = await screen.findByRole("region", { name: "Before you sign" });
    const summary = within(section).getByText("Also not mentioned (1)");
    const details = summary.closest("details") as HTMLElement;
    expect(details).not.toHaveAttribute("open");
    expect(within(details).getByText("Is there a cosigner?")).toBeInTheDocument();
    expect(within(details).getByText(/Who else would be responsible/)).toBeInTheDocument();
  });

  it("warns when the document was too long to read in full", async () => {
    keyTermsMock.mockResolvedValue({ ok: true, result: KEY_TERMS });
    checklistMock.mockResolvedValue({ ok: true, result: { ...CHECKLIST, truncated: true } });

    render(<OverviewPanel documentId="doc-1" onCitationSelect={vi.fn()} />);

    const section = await screen.findByRole("region", { name: "Before you sign" });
    expect(await within(section).findByText(/too long to read in full/i)).toBeInTheDocument();
  });
});

describe("OverviewPanel when something fails", () => {
  it("shows the message in the section that failed and still shows the other one", async () => {
    keyTermsMock.mockResolvedValue({ ok: false, message: "I couldn't read this document just now." });
    checklistMock.mockResolvedValue({ ok: true, result: CHECKLIST });

    render(<OverviewPanel documentId="doc-1" onCitationSelect={vi.fn()} />);

    const keyTerms = await screen.findByRole("region", { name: "Key terms" });
    expect(await within(keyTerms).findByRole("alert")).toHaveTextContent(/couldn't read this document/i);
    const checklist = screen.getByRole("region", { name: "Before you sign" });
    expect(await within(checklist).findByText("What is the interest rate?")).toBeInTheDocument();
  });

  it("tries again when asked, for only the section that failed", async () => {
    keyTermsMock.mockResolvedValueOnce({ ok: false, message: "Try later." });
    keyTermsMock.mockResolvedValueOnce({ ok: true, result: KEY_TERMS });
    checklistMock.mockResolvedValue({ ok: true, result: CHECKLIST });
    const user = userEvent.setup();

    render(<OverviewPanel documentId="doc-1" onCitationSelect={vi.fn()} />);
    const keyTerms = await screen.findByRole("region", { name: "Key terms" });
    await user.click(await within(keyTerms).findByRole("button", { name: "Try again" }));

    expect(await within(keyTerms).findByText("6.8% variable")).toBeInTheDocument();
    expect(keyTermsMock).toHaveBeenCalledTimes(2);
    expect(checklistMock).toHaveBeenCalledTimes(1);
  });

  it("shows loading again while a retry is running", async () => {
    keyTermsMock.mockResolvedValueOnce({ ok: false, message: "Try later." });
    keyTermsMock.mockReturnValueOnce(new Promise(() => {}));
    checklistMock.mockResolvedValue({ ok: true, result: CHECKLIST });
    const user = userEvent.setup();

    render(<OverviewPanel documentId="doc-1" onCitationSelect={vi.fn()} />);
    const keyTerms = await screen.findByRole("region", { name: "Key terms" });
    await user.click(await within(keyTerms).findByRole("button", { name: "Try again" }));

    expect(within(keyTerms).getByRole("status")).toBeInTheDocument();
    expect(within(keyTerms).queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("OverviewPanel for a different document", () => {
  it("loads the new document and does not keep showing the old one's results", async () => {
    keyTermsMock.mockResolvedValueOnce({ ok: true, result: KEY_TERMS });
    checklistMock.mockResolvedValueOnce({ ok: true, result: CHECKLIST });
    const { rerender } = render(<OverviewPanel documentId="doc-1" onCitationSelect={vi.fn()} />);
    await screen.findByText("6.8% variable");

    keyTermsMock.mockReturnValueOnce(new Promise(() => {}));
    checklistMock.mockReturnValueOnce(new Promise(() => {}));
    rerender(<OverviewPanel documentId="doc-2" onCitationSelect={vi.fn()} />);

    expect(screen.queryByText("6.8% variable")).not.toBeInTheDocument();
    expect(keyTermsMock).toHaveBeenLastCalledWith("doc-2");
    expect(screen.getAllByRole("status")).toHaveLength(2);
  });
});
