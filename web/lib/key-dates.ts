import { parseClearDate, type PlainDate } from "@/lib/dates";
import type { CalendarEvent } from "@/lib/calendar";

/** What each key term field that holds a date is called, and whether a reminder before it is useful. */
export const DATE_FIELDS: Record<string, { label: string; remind: boolean }> = {
  lease_start: { label: "Lease starts", remind: false },
  lease_end: { label: "Lease ends", remind: true },
  start_date: { label: "Job starts", remind: false },
  repayment_start: { label: "Repayments start", remind: true },
  effective_date: { label: "Takes effect", remind: false },
};

export type ClearDate = { field: string; label: string; date: PlainDate; value: string; remind: boolean };

/** The dates among a document's key terms that are clear enough to count down to or put in a calendar. */
export function clearDates(terms: { name: string; found: boolean; value: string | null }[]): ClearDate[] {
  const dates: ClearDate[] = [];
  for (const term of terms) {
    const field = DATE_FIELDS[term.name];
    const date = term.found ? parseClearDate(term.value) : null;
    if (field && date) dates.push({ field: term.name, label: field.label, date, value: term.value ?? "", remind: field.remind });
  }
  return dates;
}

/** One calendar event per clear date. The reminder is a week before the dates where a week's warning helps. */
export function calendarEvents(documentId: string, filename: string, dates: ClearDate[]): CalendarEvent[] {
  return dates.map((entry) => ({
    uid: `${documentId}-${entry.field}@brief`,
    date: entry.date,
    summary: `${entry.label}: ${filename}`,
    description: `Found in ${filename} by Brief: "${entry.value}". Check it against the document itself.`,
    remindDaysBefore: entry.remind ? 7 : null,
  }));
}
