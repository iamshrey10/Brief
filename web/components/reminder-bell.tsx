"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellRing } from "lucide-react";

import { buildCalendarFile, googleCalendarUrl } from "@/lib/calendar";
import { parseClearDate } from "@/lib/dates";
import { downloadTextFile, safeFileName } from "@/lib/download";
import { calendarEvents, DATE_FIELDS } from "@/lib/key-dates";
import { cn } from "@/lib/utils";

const linkClass =
  "flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50";

/** Where this browser remembers that a reminder was handed to a calendar, so the bell still says so after a reload. */
const addedKey = (documentId: string, value: string) => `brief-reminder-added:${documentId}:${value}`;

function readAdded(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeAdded(key: string, added: boolean): void {
  try {
    if (added) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  } catch {
    // Storage can be blocked. The bell then only remembers until the page is left, which is all that can be done.
  }
}

/**
 * A bell beside the Reminders heading. It hands the lease end date, with a reminder a week before, to the person's own calendar:
 * a Google Calendar link or a calendar file (.ics). Brief has no calendar of its own, so the event is made in the calendar they
 * choose. Once one of the two is used the bell says so, and keeps saying so on later visits in this browser, so the same date is not
 * added twice by accident (the file carries a fixed id, which calendar apps use to update one event instead of making a second).
 * It shows nothing when the date is too loose to be put in a calendar.
 */
export function ReminderBell({ documentId, filename, value }: { documentId: string; filename: string; value: string }) {
  const key = addedKey(documentId, value);
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState("");
  const wrapper = useRef<HTMLDivElement>(null);

  // What this browser remembered. Read after the page has loaded, so the server and the browser first show the same thing.
  useEffect(() => {
    const id = window.setTimeout(() => setAdded(readAdded(key)), 0);
    return () => window.clearTimeout(id);
  }, [key]);

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

  function done() {
    writeAdded(key, true);
    setAdded(true);
    setError("");
    setOpen(false);
  }

  function saveFile() {
    try {
      downloadTextFile(safeFileName(filename, "lease-end", "ics"), buildCalendarFile([event]), "text/calendar");
    } catch {
      setError("The calendar file could not be made. Please try again.");
      return;
    }
    done();
  }

  function addAgain() {
    writeAdded(key, false);
    setAdded(false);
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
        aria-label={added ? "Added to your calendar" : "Remind me in my calendar"}
        aria-expanded={open}
        aria-controls="reminder-choices"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex size-9 max-sm:size-11 items-center justify-center rounded-full border outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          added ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90" : "border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
        )}
      >
        {added ? <BellRing className="size-4" aria-hidden="true" /> : <Bell className="size-4" aria-hidden="true" />}
      </button>
      {open && (
        <div id="reminder-choices" className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-border bg-card p-2 shadow-lg">
          {added ? (
            <>
              <p role="status" className="px-3 pt-1 pb-1 text-sm font-medium text-foreground">
                Added to your calendar
              </p>
              <p className="px-3 pb-2 text-xs text-muted-foreground">Open your calendar to see it on {value}, with a reminder a week before.</p>
              <button type="button" onClick={addAgain} className={linkClass}>
                Not there? Add it again
              </button>
            </>
          ) : (
            <>
              <p className="px-3 pt-1 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Google Calendar</p>
              <a href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer" onClick={done} className={linkClass}>
                Lease ends: {value}
              </a>
              <p className="px-3 pt-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Apple Calendar, Outlook</p>
              <button type="button" onClick={saveFile} className={linkClass}>
                Download calendar file (.ics)
              </button>
              {error && (
                <p role="alert" className="px-3 pt-2 text-xs text-destructive">
                  {error}
                </p>
              )}
              <p className="px-3 pt-2 pb-1 text-xs text-muted-foreground">An all day event, with a reminder a week before it ends.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
