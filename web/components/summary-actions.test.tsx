// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/download", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/download")>()), downloadBytes: vi.fn() }));

import { downloadBytes } from "@/lib/download";
import type { ChecklistResult, KeyTermsResult } from "@/lib/overview";
import { SummaryActions } from "./summary-actions";

const download = vi.mocked(downloadBytes);
const KEY_TERMS: KeyTermsResult = {
  terms: [{ name: "monthly_rent", label: "Monthly rent", found: true, value: "$1,650.00", clause_id: "c1", page_number: 1, quote: "q", evidence: [] }],
  truncated: false,
};
const CHECKLIST: ChecklistResult = {
  answers: [{ id: "a", question: "q", why_it_matters: "w", importance: "high", status: "not_mentioned", answer: null, evidence: [], gap: true, ask_them: "Does it renew automatically?" }],
  truncated: false,
};

let writeText: ReturnType<typeof vi.fn>;
beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});
afterEach(() => {
  cleanup();
  download.mockReset();
});

describe("the summary buttons", () => {
  it("copies the summary as plain text and says it was copied", async () => {
    render(<SummaryActions documentId="d1" docType="lease" filename="Maple Court.pdf" keyTerms={KEY_TERMS} checklist={CHECKLIST} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy summary" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Copied. Paste it anywhere."));
    const text = writeText.mock.calls[0][0] as string;
    expect(text).toContain("SUMMARY OF MY LEASE, FROM BRIEF");
    expect(text).toContain("* Monthly rent: $1,650.00 (page 1)");
    expect(text).toContain("1. Does it renew automatically?");
    expect(text).not.toContain("Maple");
  });

  it("says so, and does not claim it copied, when the browser refuses", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    render(<SummaryActions documentId="d1" docType="lease" filename="a.pdf" keyTerms={KEY_TERMS} checklist={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy summary" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("would not allow copying"));
  });

  it("saves a PDF named after the document, which the PDF's own text does not repeat", () => {
    render(<SummaryActions documentId="d1" docType="loan" filename="Loan Sanction Letter pdf.pdf" keyTerms={KEY_TERMS} checklist={CHECKLIST} />);

    fireEvent.click(screen.getByRole("button", { name: "Download summary (PDF)" }));

    const [name, bytes, type] = download.mock.calls[0];
    expect(name).toBe("Loan-Sanction-Letter-pdf-summary.pdf");
    expect(type).toBe("application/pdf");
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/Title <FEFF");
    expect(text).not.toContain("Sanction");
    expect(text).toContain("/Type /Page ");
  });

  it("is left off the printed page", () => {
    const { container } = render(<SummaryActions documentId="d1" docType="lease" filename="a.pdf" keyTerms={KEY_TERMS} checklist={null} />);

    expect(container.firstChild).toHaveClass("print:hidden");
  });

  it("sits calendar and email beside copy and download, as one row of actions", () => {
    const withDate: KeyTermsResult = {
      terms: [{ name: "lease_end", label: "Lease end date", found: true, value: "December 31, 2027", clause_id: "c1", page_number: 1, quote: "q", evidence: [] }],
      truncated: false,
    };
    render(<SummaryActions documentId="d1" docType="lease" filename="a.pdf" keyTerms={withDate} checklist={CHECKLIST} />);

    const names = [...screen.getAllByRole("button"), ...screen.getAllByRole("link")].map((el) => el.textContent);
    expect(names).toEqual(["Copy summary", "Download summary (PDF)", "Add this date to your calendar", "Email these questions"]);
    expect(screen.getByRole("link", { name: "Email these questions" })).toHaveAttribute("href", expect.stringMatching(/^mailto:\?subject=/));
    expect(screen.getByText(/Nothing is sent by Brief/)).toBeInTheDocument();
    expect(screen.getByText(/only when the document states them clearly/)).toBeInTheDocument();
  });

  it("leaves out the calendar when no date is clear and the email when nothing important is open", () => {
    render(<SummaryActions documentId="d1" docType="lease" filename="a.pdf" keyTerms={KEY_TERMS} checklist={null} />);

    expect(screen.queryByRole("button", { name: /calendar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Email these questions" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Nothing is sent by Brief/)).not.toBeInTheDocument();
  });
});
