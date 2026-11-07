"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";

import { buildCalendarFile, googleCalendarUrl } from "@/lib/calendar";
import { parseClearDate } from "@/lib/dates";
import { downloadTextFile, safeFileName } from "@/lib/download";
import { calendarEvents, DATE_FIELDS } from "@/lib/key-dates";

const linkClass =
  "flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * A bell beside the Reminders heading. It puts the lease end date, with a reminder a week before, into a calendar:
 * a Google Calendar link or a calendar file (.ics). It shows nothing when the date is too loose to be put in a calendar.
 */
export function ReminderBell({ documentId, filename, value }: { documentId: string; filename: string; value: string }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const date = parseClearDate(value);
  if (!date) return null;
  const field = DATE_FIELDS.lease_end;
  const [event] = calendarEvents(documentId, filename, [{ field: "lease_end", label: field.label, date, value, remind: field.remind }]);

  function saveFile() {
    downloadTextFile(safeFileName(filename, "lease-end", "ics"), buildCalendarFile([event]), "text/calendar");
    setOpen(false);
  }

  return (
    <div
      ref={wrapper}
      className="relative"
      onKeyDown={(key) => {
        if (key.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label="Remind me in my calendar"
        aria-expanded={open}
        aria-controls="reminder-choices"
        onClick={() => setOpen((current) => !current)}
        className="flex size-9 items-center justify-center rounded-full border border-border bg-background text-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Bell className="size-4" aria-hidden="true" />
      </button>
      {open && (
        <div id="reminder-choices" className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-border bg-card p-2 shadow-lg">
          <p className="px-3 pt-1 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Google Calendar</p>
          <a href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className={linkClass}>
            Lease ends: {value}
          </a>
          <p className="px-3 pt-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Apple Calendar, Outlook</p>
          <button type="button" onClick={saveFile} className={linkClass}>
            Download calendar file (.ics)
          </button>
          <p className="px-3 pt-2 pb-1 text-xs text-muted-foreground">You get a reminder a week before it ends.</p>
        </div>
      )}
    </div>
  );
}
