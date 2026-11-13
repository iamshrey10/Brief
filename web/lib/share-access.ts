/** How long someone may look at a shared dashboard once approved: a length of time, or the end of a calendar day. */
export type AccessChoice = { kind: "hours"; hours: number } | { kind: "until"; until: string };

/** The lengths on offer, the same ones the backend accepts. */
export const ACCESS_OPTIONS = [
  { hours: 1, label: "1 hour" },
  { hours: 6, label: "6 hours" },
  { hours: 24, label: "1 day" },
  { hours: 168, label: "7 days" },
  { hours: 360, label: "15 days" },
  { hours: 720, label: "30 days" },
  { hours: 2160, label: "90 days" },
] as const;

export const DEFAULT_ACCESS_HOURS = 168;
/** No share lasts longer than this, and the calendar does not offer a day beyond it. */
export const MAX_ACCESS_DAYS = 90;

/** What to send the backend for a choice. */
export function accessBody(choice: AccessChoice): { hours: number } | { until: string } {
  return choice.kind === "hours" ? { hours: choice.hours } : { until: choice.until };
}

const pad = (value: number) => String(value).padStart(2, "0");

/** A date as the calendar box writes it, "2026-11-30", in the person's own time zone. */
export function dayText(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The first and last day the calendar offers: today, and 90 days on. */
export function dateBounds(now: Date = new Date()): { min: string; max: string } {
  const last = new Date(now.getFullYear(), now.getMonth(), now.getDate() + MAX_ACCESS_DAYS);
  return { min: dayText(now), max: dayText(last) };
}

/**
 * The close of a calendar day, "2026-11-30", where the person is: 23:59:59 that evening, as a moment the backend can read.
 * Null for text that is not a real day, or a day already over or past the last one on offer.
 */
export function endOfDay(day: string, now: Date = new Date()): string | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!parts) return null;
  const [year, month, date] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  const end = new Date(year, month - 1, date, 23, 59, 59);
  if (end.getFullYear() !== year || end.getMonth() !== month - 1 || end.getDate() !== date) return null;
  const { min, max } = dateBounds(now);
  if (day < min || day > max) return null;
  return end.toISOString();
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** "Ends in 3 days", "Ends in 5 hours", "Ends in 20 minutes", or "Ended". */
export function timeLeftText(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "";
  const minutes = Math.ceil((new Date(iso).getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return "Ended";
  if (minutes < 60) return `Ends in ${plural(minutes, "minute")}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `Ends in ${plural(hours, "hour")}`;
  return `Ends in ${plural(Math.floor(hours / 24), "day")}`;
}

/** What the person chose for an invitation that is not approved yet, where the time has not started to count. */
export function chosenAccessText(hours: number | null, until: string | null, now: Date = new Date()): string {
  if (until) {
    const days = Math.max(1, Math.ceil((new Date(until).getTime() - now.getTime()) / 86_400_000));
    return `Until a date ${plural(days, "day")} away`;
  }
  const option = ACCESS_OPTIONS.find((candidate) => candidate.hours === (hours ?? DEFAULT_ACCESS_HOURS));
  return `${option?.label ?? plural(hours ?? DEFAULT_ACCESS_HOURS, "hour")} once you approve`;
}
