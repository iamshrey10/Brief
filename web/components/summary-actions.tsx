"use client";

import { useEffect, useRef, useState } from "react";

import { CalendarButton } from "@/components/calendar-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { downloadBytes, safeFileName } from "@/lib/download";
import { clearDates } from "@/lib/key-dates";
import { buildQuestionsEmail } from "@/lib/questions-email";
import type { ChecklistResult, KeyTermsResult } from "@/lib/overview";
import { buildPdf } from "@/lib/pdf";
import { buildSummary, summaryBlocks } from "@/lib/summary-text";

/**
 * The one row of actions that take what is on the Overview away with you: copy it as plain text, save it as a
 * PDF, add its clear dates to a calendar, and email the questions it leaves open. All of it is built in the
 * browser from what is already loaded, so nothing is sent anywhere and the AI is not asked again. A button with
 * nothing to act on, such as the calendar for a document with no clear date, is left out. The checklist may be missing,
 * and then there are no questions to email and the summary has none.
 */
export function SummaryActions({
  documentId,
  docType,
  filename,
  keyTerms,
  checklist,
}: {
  documentId: string;
  docType: string;
  filename: string;
  keyTerms: KeyTermsResult;
  checklist: ChecklistResult | null;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const email = buildQuestionsEmail(docType, checklist?.answers ?? []);
  const hasDates = clearDates(keyTerms.terms).length > 0;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(buildSummary(docType, keyTerms, checklist));
      setStatus("copied");
    } catch {
      // Clipboard access can be blocked, so say so instead of looking like nothing happened.
      setStatus("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), 2500);
  }

  function save() {
    const blocks = summaryBlocks(docType, keyTerms, checklist);
    downloadBytes(safeFileName(filename, "summary", "pdf"), buildPdf(blocks, blocks[0].text), "application/pdf");
  }

  return (
    <div className="flex flex-col gap-2 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="lg" onClick={copy}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V6a2 2 0 0 1 2-2h9" />
          </svg>
          Copy summary
        </Button>
        <Button type="button" variant="outline" size="lg" onClick={save}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
          </svg>
          Download summary (PDF)
        </Button>
        <CalendarButton documentId={documentId} filename={filename} terms={keyTerms.terms} />
        {email && (
          <a href={email.href} className={buttonVariants({ variant: "outline", size: "lg" })}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
            Email these questions
          </a>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {hasDates && "Dates are added only when the document states them clearly, so check them. "}
        {email &&
          (email.included < email.total
            ? `The email holds the first ${email.included} of ${email.total} questions, and opens in your own mail program. Copy summary has them all. `
            : "The email opens in your own mail program. ")}
        {(hasDates || email) && "Nothing is sent by Brief."}
        <span role="status" className="ml-1">
          {status === "copied" ? "Copied. Paste it anywhere." : status === "failed" ? "Your browser would not allow copying." : ""}
        </span>
      </p>
    </div>
  );
}
