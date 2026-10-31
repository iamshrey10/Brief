"use client";

import { Button } from "@/components/ui/button";
import { buildCalendarFile } from "@/lib/calendar";
import { downloadTextFile, safeFileName } from "@/lib/download";
import { calendarEvents, clearDates } from "@/lib/key-dates";

/**
 * Saves the clear dates found in a document as a calendar file. Nothing is sent anywhere: the file is made in the
 * browser from the key terms already on screen. It shows nothing when no date is clear enough to be worth adding.
 * The note that only clearly stated dates are used is under the row of buttons it sits in.
 */
export function CalendarButton({
  documentId,
  filename,
  terms,
}: {
  documentId: string;
  filename: string;
  terms: { name: string; found: boolean; value: string | null }[];
}) {
  const dates = clearDates(terms);
  if (dates.length === 0) return null;

  function save() {
    const file = buildCalendarFile(calendarEvents(documentId, filename, dates));
    downloadTextFile(safeFileName(filename, "dates", "ics"), file, "text/calendar");
  }

  return (
    <Button type="button" variant="outline" size="lg" onClick={save}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </svg>
      Add {dates.length === 1 ? "this date" : `these ${dates.length} dates`} to your calendar
    </Button>
  );
}
