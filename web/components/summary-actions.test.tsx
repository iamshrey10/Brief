// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/download", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/download")>()), downloadTextFile: vi.fn() }));

import { downloadTextFile } from "@/lib/download";
import type { ChecklistResult, KeyTermsResult } from "@/lib/overview";
import { SummaryActions } from "./summary-actions";

const download = vi.mocked(downloadTextFile);
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
    render(<SummaryActions docType="lease" filename="Maple Court.pdf" keyTerms={KEY_TERMS} checklist={CHECKLIST} />);

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
    render(<SummaryActions docType="lease" filename="a.pdf" keyTerms={KEY_TERMS} checklist={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy summary" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("would not allow copying"));
  });

  it("saves a Markdown file named after the document, which the file's own text does not repeat", () => {
    render(<SummaryActions docType="loan" filename="Loan Sanction Letter pdf.pdf" keyTerms={KEY_TERMS} checklist={CHECKLIST} />);

    fireEvent.click(screen.getByRole("button", { name: "Download summary" }));

    const [name, text, type] = download.mock.calls[0];
    expect(name).toBe("Loan-Sanction-Letter-pdf-summary.md");
    expect(type).toBe("text/markdown");
    expect(text).toContain("# Summary of my education loan, from Brief");
    expect(text).not.toContain("Sanction");
  });

  it("is left off the printed page", () => {
    const { container } = render(<SummaryActions docType="lease" filename="a.pdf" keyTerms={KEY_TERMS} checklist={null} />);

    expect(container.firstChild).toHaveClass("print:hidden");
  });
});
