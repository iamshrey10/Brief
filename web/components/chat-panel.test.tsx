// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  askQuestion,
  MAX_QUESTION_LENGTH,
  type AskCitation,
  type AskOutcome,
  type AskResult,
} from "@/lib/ask";
import { fetchUsage, type Usage, type UsageEntry } from "@/lib/usage";
import { ChatPanel } from "./chat-panel";

vi.mock("@/lib/ask", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ask")>();
  return { ...actual, askQuestion: vi.fn() };
});

vi.mock("@/lib/usage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/usage")>();
  return { ...actual, fetchUsage: vi.fn() };
});

const askMock = vi.mocked(askQuestion);
const usageMock = vi.mocked(fetchUsage);

const entry = (used: number, limit = 100): UsageEntry => ({ used, limit, left: Math.max(limit - used, 0) });
const usageWith = (asked: number): Usage => ({ ask: entry(asked), read: entry(0, 30), analyze: entry(0, 60) });

const FOUND: AskResult = {
  found: true,
  answer: "Yes, you can pay early with no penalty.",
  citations: [
    {
      clause_id: "clause-1",
      page_number: 2,
      clause_text: "The borrower may prepay at any time without penalty.",
      quote: "without penalty",
    },
  ],
};

const NOT_FOUND: AskResult = {
  found: false,
  answer: "I couldn't find this in the document.",
  citations: [],
};

beforeEach(() => {
  usageMock.mockResolvedValue({ ok: true, usage: usageWith(0) });
  // jsdom doesn't implement element scrolling, and the panel scrolls its own conversation.
  Object.defineProperty(Element.prototype, "scrollTo", { value: vi.fn(), configurable: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPanel(onCitationSelect: (citation: AskCitation) => void = vi.fn()) {
  const user = userEvent.setup();
  render(<ChatPanel documentId="doc-1" onCitationSelect={onCitationSelect} />);
  return { user, box: screen.getByLabelText("Your question") };
}

describe("ChatPanel", () => {
  it("explains what it does before anything is asked", () => {
    renderPanel();

    expect(screen.getByText(/points to the exact clause it came from/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
    expect(screen.getByText(/not legal advice/i)).toBeInTheDocument();
  });

  it("sends a trimmed question, shows it, and clears the box", async () => {
    askMock.mockResolvedValue({ ok: true, result: FOUND });
    const { user, box } = renderPanel();

    await user.type(box, "  Can I pay early?  ");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    expect(askMock).toHaveBeenCalledWith("doc-1", "Can I pay early?");
    expect(await screen.findByText("Can I pay early?")).toBeInTheDocument();
    expect(box).toHaveValue("");
  });

  it("shows the answer with its quoted citation and page", async () => {
    askMock.mockResolvedValue({ ok: true, result: FOUND });
    const { user, box } = renderPanel();

    await user.type(box, "Can I pay early?{Enter}");

    expect(await screen.findByText(FOUND.answer)).toBeInTheDocument();
    expect(screen.getByText("From the document")).toBeInTheDocument();
    expect(screen.getByText("Page 2")).toBeInTheDocument();
    expect(screen.getByText(/without penalty/)).toBeInTheDocument();
  });

  it("treats not finding an answer as a normal reply, with no citations shown", async () => {
    askMock.mockResolvedValue({ ok: true, result: NOT_FOUND });
    const { user, box } = renderPanel();

    await user.type(box, "What is the maximum loan?{Enter}");

    expect(await screen.findByText(NOT_FOUND.answer)).toBeInTheDocument();
    expect(screen.queryByText("From the document")).not.toBeInTheDocument();
  });

  it("shows a plain-language message when asking fails", async () => {
    askMock.mockResolvedValue({
      ok: false,
      message: "You're asking faster than I can answer. Wait a few seconds and try again.",
    });
    const { user, box } = renderPanel();

    await user.type(box, "Anything?{Enter}");

    expect(await screen.findByText(/asking faster than I can answer/i)).toBeInTheDocument();
  });

  it("will not send a second question while one is still being answered", async () => {
    let resolveAsk!: (outcome: AskOutcome) => void;
    askMock.mockReturnValue(
      new Promise<AskOutcome>((resolve) => {
        resolveAsk = resolve;
      }),
    );
    const { user, box } = renderPanel();

    await user.type(box, "First{Enter}");
    expect(await screen.findByText("Reading the document...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Asking..." })).toBeDisabled();

    await user.type(box, "Second{Enter}");
    expect(askMock).toHaveBeenCalledTimes(1);

    resolveAsk({ ok: true, result: NOT_FOUND });
    expect(await screen.findByText(NOT_FOUND.answer)).toBeInTheDocument();
    expect(screen.queryByText("Reading the document...")).not.toBeInTheDocument();
  });

  it("sends on Enter but adds a new line on Shift+Enter", async () => {
    askMock.mockResolvedValue({ ok: true, result: NOT_FOUND });
    const { user, box } = renderPanel();

    await user.type(box, "line one{Shift>}{Enter}{/Shift}line two");
    expect(askMock).not.toHaveBeenCalled();
    expect(box).toHaveValue("line one\nline two");

    await user.keyboard("{Enter}");
    expect(askMock).toHaveBeenCalledWith("doc-1", "line one\nline two");
  });

  it("does not send an empty or whitespace-only question", async () => {
    const { user, box } = renderPanel();

    await user.type(box, "   {Enter}");

    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
    expect(askMock).not.toHaveBeenCalled();
  });

  it("limits the question to the length the backend accepts", () => {
    const { box } = renderPanel();

    expect(box).toHaveAttribute("maxlength", String(MAX_QUESTION_LENGTH));
  });

  it("keeps questions and answers in the order they happened", async () => {
    askMock
      .mockResolvedValueOnce({ ok: true, result: FOUND })
      .mockResolvedValueOnce({ ok: true, result: NOT_FOUND });
    const { user, box } = renderPanel();

    await user.type(box, "First question{Enter}");
    await screen.findByText(FOUND.answer);
    await user.type(box, "Second question{Enter}");
    await screen.findByText(NOT_FOUND.answer);

    const conversation = screen.getByRole("log").textContent ?? "";
    const positions = [
      "First question",
      FOUND.answer,
      "Second question",
      NOT_FOUND.answer,
    ].map((text) => conversation.indexOf(text));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("lets the reader pick a citation to see it in the document", async () => {
    askMock.mockResolvedValue({ ok: true, result: FOUND });
    const onCitationSelect = vi.fn();
    const { user, box } = renderPanel(onCitationSelect);

    await user.type(box, "Can I pay early?{Enter}");
    await user.click(await screen.findByRole("button", { name: /without penalty/ }));

    expect(onCitationSelect).toHaveBeenCalledTimes(1);
    expect(onCitationSelect).toHaveBeenCalledWith(FOUND.citations[0]);
  });

  it("hands over the right citation when an answer cites more than one clause", async () => {
    const second: AskCitation = {
      clause_id: "clause-2",
      page_number: 3,
      clause_text: "A late fee of fifty dollars applies after five days.",
      quote: "late fee of fifty dollars",
    };
    askMock.mockResolvedValue({
      ok: true,
      result: { ...FOUND, citations: [...FOUND.citations, second] },
    });
    const onCitationSelect = vi.fn();
    const { user, box } = renderPanel(onCitationSelect);

    await user.type(box, "What are the payment terms?{Enter}");
    await user.click(await screen.findByRole("button", { name: /late fee of fifty dollars/ }));

    expect(onCitationSelect).toHaveBeenCalledWith(second);
  });
});

describe("ChatPanel daily limit note", () => {
  it("says nothing while plenty of questions are left", async () => {
    usageMock.mockResolvedValue({ ok: true, usage: usageWith(10) });
    renderPanel();

    await waitFor(() => expect(usageMock).toHaveBeenCalled());

    expect(screen.queryByText(/left today/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/used all of today/i)).not.toBeInTheDocument();
  });

  it("says how many are left once few remain", async () => {
    usageMock.mockResolvedValue({ ok: true, usage: usageWith(95) });
    renderPanel();

    expect(await screen.findByText("5 questions left today")).toBeInTheDocument();
  });

  it("says plainly when none are left, and still lets a question be sent, since the server decides", async () => {
    usageMock.mockResolvedValue({ ok: true, usage: usageWith(100) });
    askMock.mockResolvedValue({ ok: false, message: "You have reached today's limit of 100 questions. Try again tomorrow." });
    const { user, box } = renderPanel();

    expect(await screen.findByText("You have used all of today's questions. Try again tomorrow.")).toBeInTheDocument();
    await user.type(box, "One more?");

    expect(screen.getByRole("button", { name: "Ask" })).toBeEnabled();
  });

  it("shows nothing and works as usual when the numbers cannot be fetched", async () => {
    usageMock.mockResolvedValue({ ok: false });
    askMock.mockResolvedValue({ ok: true, result: FOUND });
    const { user, box } = renderPanel();
    await waitFor(() => expect(usageMock).toHaveBeenCalled());

    await user.type(box, "Can I pay early?{Enter}");

    expect(await screen.findByText(FOUND.answer)).toBeInTheDocument();
    const footer = screen.getByText("Explains what the document says. Not legal advice.").parentElement;
    expect(footer?.querySelectorAll("p")).toHaveLength(1); // only the disclaimer, no note of any kind
  });

  it("looks again after a question is answered, so the count goes down as the person works", async () => {
    usageMock.mockResolvedValueOnce({ ok: true, usage: usageWith(91) });
    usageMock.mockResolvedValueOnce({ ok: true, usage: usageWith(92) });
    askMock.mockResolvedValue({ ok: true, result: FOUND });
    const { user, box } = renderPanel();
    expect(await screen.findByText("9 questions left today")).toBeInTheDocument();

    await user.type(box, "Can I pay early?{Enter}");

    expect(await screen.findByText("8 questions left today")).toBeInTheDocument();
    expect(usageMock).toHaveBeenCalledTimes(2);
  });

  it("looks again after a refused question too, since that is when the number matters most", async () => {
    usageMock.mockResolvedValueOnce({ ok: true, usage: usageWith(99) });
    usageMock.mockResolvedValueOnce({ ok: true, usage: usageWith(100) });
    askMock.mockResolvedValue({ ok: false, message: "Something went wrong getting an answer. Try again in a moment." });
    const { user, box } = renderPanel();
    expect(await screen.findByText("1 question left today")).toBeInTheDocument();

    await user.type(box, "Anything?{Enter}");

    expect(await screen.findByText("You have used all of today's questions. Try again tomorrow.")).toBeInTheDocument();
  });

  it("does not look at anything other than the questions limit", async () => {
    usageMock.mockResolvedValue({
      ok: true,
      usage: { ask: entry(0), read: { used: 30, limit: 30, left: 0 }, analyze: { used: 60, limit: 60, left: 0 } },
    });
    renderPanel();
    await waitFor(() => expect(usageMock).toHaveBeenCalled());

    expect(screen.queryByText(/used all of today/i)).not.toBeInTheDocument();
  });
});
