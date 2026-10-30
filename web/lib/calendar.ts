import { nextDay, toISODate, type PlainDate } from "@/lib/dates";

export type CalendarEvent = {
  /** Stays the same for the same date of the same document, so adding it twice replaces it in most calendars. */
  uid: string;
  date: PlainDate;
  summary: string;
  description: string;
  /** Days before the date to remind, or null for no reminder. */
  remindDaysBefore: number | null;
};

const compact = (date: PlainDate) => toISODate(date).replaceAll("-", "");

/** Text as a calendar file wants it: backslashes, semicolons and commas escaped, line breaks written as \n. */
export function escapeText(text: string): string {
  return text.replaceAll("\\", "\\\\").replaceAll(";", "\;").replaceAll(",", "\\,").replace(/\r?\n/g, "\\n");
}

/** A line longer than 75 bytes is folded onto the next line, which starts with a space, as the format requires. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  for (const char of line) {
    const limit = parts.length === 0 ? 75 : 74; // later lines start with a space
    if (encoder.encode(current + char).length > limit) {
      parts.push(current);
      current = "";
    }
    current += char;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** An all day calendar file (.ics) with one event per date, readable by Google Calendar, Apple Calendar and Outlook. */
export function buildCalendarFile(events: CalendarEvent[], now: Date = new Date()): string {
  const stamp = `${now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Brief//Key dates//EN", "CALSCALE:GREGORIAN"];
  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(event.date)}`,
      `DTEND;VALUE=DATE:${compact(nextDay(event.date))}`,
      `SUMMARY:${escapeText(event.summary)}`,
      `DESCRIPTION:${escapeText(event.description)}`,
      "TRANSP:TRANSPARENT",
    );
    if (event.remindDaysBefore !== null) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeText(event.summary)}`,
        `TRIGGER:-P${event.remindDaysBefore}D`,
        "END:VALARM",
      );
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
