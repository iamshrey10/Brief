"use client";

import { Button } from "@/components/ui/button";

/** Opens the browser's print dialog, where the page prints as the Overview alone and can be saved as a PDF. */
export function PrintButton() {
  return (
    <Button type="button" variant="outline" size="lg" onClick={() => window.print()} className="print:hidden">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <path d="M6 14h12v7H6z" />
      </svg>
      Print or save as PDF
    </Button>
  );
}
