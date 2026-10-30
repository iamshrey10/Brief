/** A calendar day with no time and no time zone, so counting days never depends on where or when it is computed. */
export type PlainDate = { year: number; month: number; day: number };

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH_WORDS =
  "(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";

function valid(year: number, month: number, day: number): PlainDate | null {
  const check = new Date(Date.UTC(year, month - 1, day));
  const real = check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
  return real && year >= 1900 && year <= 2200 ? { year, month, day } : null;
}

/**
 * The one clear date in a piece of text, or null. Understands "March 9, 2026", "Mar 9 2026", "9 March 2026" and
 * "2026-03-09". It gives up, and returns null, when there is no clear date ("6 months after graduation"), when the
 * date is a made up one ("February 30, 2026"), or when there are two different dates, because guessing which one
 * is meant would put a wrong date in someone's calendar. A numeric date such as 03/04/2026 is never read, since it
 * means different days in different countries.
 */
export function parseClearDate(text: string | null | undefined): PlainDate | null {
  if (!text) return null;
  const found: PlainDate[] = [];

  for (const match of text.matchAll(new RegExp(`\\b${MONTH_WORDS}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "gi"))) {
    const date = valid(Number(match[3]), MONTHS[match[1].slice(0, 3).toLowerCase()], Number(match[2]));
    if (date) found.push(date);
  }
  for (const match of text.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_WORDS}\\.?,?\\s+(\\d{4})\\b`, "gi"))) {
    const date = valid(Number(match[3]), MONTHS[match[2].slice(0, 3).toLowerCase()], Number(match[1]));
    if (date) found.push(date);
  }
  for (const match of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    const date = valid(Number(match[1]), Number(match[2]), Number(match[3]));
    if (date) found.push(date);
  }

  const distinct = new Map(found.map((date) => [toISODate(date), date]));
  return distinct.size === 1 ? [...distinct.values()][0] : null;
}

export function toISODate(date: PlainDate): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

/** Today's date where the person is, not where the server is. */
export function localToday(now: Date = new Date()): PlainDate {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/** Whole days from one day to another: positive when `to` is later. */
export function daysBetween(from: PlainDate, to: PlainDate): number {
  const ms = Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day);
  return Math.round(ms / 86_400_000);
}

/** The day after, for the end of an all day calendar event, which is exclusive. */
export function nextDay(date: PlainDate): PlainDate {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + 1));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}
