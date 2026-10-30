import { daysBetween, parseClearDate, type PlainDate } from "@/lib/dates";
import type { CalendarEvent } from "@/lib/calendar";

/** What each key term field that holds a date is called, in the present and the past, and whether a reminder before it is useful. */
export const DATE_FIELDS: Record<string, { label: string; past: string; remind: boolean }> = {
  lease_start: { label: "Lease starts", past: "Lease started", remind: false },
  lease_end: { label: "Lease ends", past: "Lease ended", remind: true },
  start_date: { label: "Job starts", past: "Job started", remind: false },
  repayment_start: { label: "Repayments start", past: "Repayments started", remind: true },
  effective_date: { label: "Takes effect", past: "Took effect", remind: false },
};

export type KeyDateFromApi = { document_id: string; field: string; label: string; value: string };
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

/** "Lease ends in 62 days", "Lease ends tomorrow", "Lease ended 5 days ago". */
export function countdownText(field: string, days: number): string {
  const { label, past } = DATE_FIELDS[field];
  if (days === 0) return `${label} today`;
  if (days === 1) return `${label} tomorrow`;
  if (days === -1) return `${past} yesterday`;
  return days > 0 ? `${label} in ${days} days` : `${past} ${-days} days ago`;
}

export type Upcoming = { documentId: string; text: string; days: number };

/**
 * The next dates across a person's documents, soonest first, looking only at ones that are clear dates from a few
 * days ago to the future. A loose phrase is left out. `limit` keeps the strip short.
 */
export function upcomingDates(keyDates: KeyDateFromApi[], today: PlainDate, limit = 3): Upcoming[] {
  const upcoming: Upcoming[] = [];
  for (const entry of keyDates) {
    const date = parseClearDate(entry.value);
    if (!date || !(entry.field in DATE_FIELDS)) continue;
    const days = daysBetween(today, date);
    if (days < -7) continue;
    upcoming.push({ documentId: entry.document_id, text: countdownText(entry.field, days), days });
  }
  return upcoming.sort((a, b) => a.days - b.days).slice(0, limit);
}
