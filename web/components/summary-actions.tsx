"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { downloadTextFile, safeFileName } from "@/lib/download";
import type { ChecklistResult, KeyTermsResult } from "@/lib/overview";
import { buildSummary } from "@/lib/summary-text";

/**
 * Two buttons that take what is on the Overview away with you: one copies it as plain text to paste into a message,
 * one saves it as a Markdown file. Built in the browser from what is already loaded, so nothing is sent anywhere
 * and the AI is not asked again. The checklist may be missing, and then the summary simply has no questions.
 */
export function SummaryActions({
  docType,
  filename,
  keyTerms,
  checklist,
}: {
  docType: string;
  filename: string;
  keyTerms: KeyTermsResult;
  checklist: ChecklistResult | null;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(buildSummary(docType, keyTerms, checklist, "text"));
      setStatus("copied");
    } catch {
      // Clipboard access can be blocked, so say so instead of looking like nothing happened.
      setStatus("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), 2500);
  }

  function save() {
    downloadTextFile(safeFileName(filename, "summary", "md"), buildSummary(docType, keyTerms, checklist, "markdown"), "text/markdown");
  }

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
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
        Download summary
      </Button>
      <span role="status" className="text-xs text-muted-foreground">
        {status === "copied" ? "Copied. Paste it anywhere." : status === "failed" ? "Your browser would not allow copying." : ""}
      </span>
    </div>
  );
}
