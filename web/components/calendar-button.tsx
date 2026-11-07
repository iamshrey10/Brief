"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { buildCalendarFile, googleCalendarUrl } from "@/lib/calendar";
import { downloadTextFile, safeFileName } from "@/lib/download";
import { calendarEvents, clearDates } from "@/lib/key-dates";

const linkClass =
  "flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Puts the clear dates found in a document into a calendar. There are two ways: a link that opens Google Calendar with
 * the event filled in, or a calendar file (.ics) that Apple Calendar, Outlook and others open when it is clicked. Nothing
 * is sent anywhere by Brief: the file and links are made in the browser from the key terms already on screen. It shows
 * nothing when no date is clear enough to be worth adding.
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
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  // Clicking elsewhere or pressing Escape closes the choices.
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const dates = clearDates(terms);
  if (dates.length === 0) return null;
  const events = calendarEvents(documentId, filename, dates);

  function saveFile() {
    downloadTextFile(safeFileName(filename, "dates", "ics"), buildCalendarFile(events), "text/calendar");
    setOpen(false);
  }

  return (
    <div
      ref={wrapper}
      className="relative"
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <Button type="button" variant="outline" size="lg" aria-expanded={open} aria-controls="calendar-choices" onClick={() => setOpen((value) => !value)}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
        Add to calendar
      </Button>
      {open && (
        <div id="calendar-choices" className="absolute left-0 z-30 mt-2 w-72 rounded-xl border border-border bg-card p-2 shadow-lg">
          <p className="px-3 pt-1 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Google Calendar</p>
          {events.map((event, index) => (
            <a key={event.uid} href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className={linkClass}>
              {dates[index].label}: {dates[index].value}
            </a>
          ))}
          <p className="px-3 pt-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Apple Calendar, Outlook</p>
          <button type="button" onClick={saveFile} className={linkClass}>
            Download calendar file (.ics)
            {events.length > 1 ? `, ${events.length} dates` : ""}
          </button>
          <p className="px-3 pt-2 pb-1 text-xs text-muted-foreground">Open the file and your calendar app asks to add it.</p>
        </div>
      )}
    </div>
  );
}
