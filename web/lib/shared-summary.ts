import { daysBetween, localToday, parseClearDate } from "@/lib/dates";
import type { InsightFromApi } from "@/lib/dashboard";
import type { SharedDashboard } from "@/lib/sharing";

export type DateItem = {
  key: string;
  label: string;
  filename: string;
  value: string;
  /** Days from today, negative once it has passed, or null for a loose phrase that cannot be counted. */
  days: number | null;
};

/**
 * Every important date found, soonest first: those still ahead, then those that have passed with the most recent first,
 * then loose phrases such as "6 months after graduation", which are shown as written because they cannot be counted down to.
 */
export function importantDates(shared: Pick<SharedDashboard, "key_dates" | "documents">, now: Date = new Date()): DateItem[] {
  const today = localToday(now);
  const items = shared.key_dates.flatMap((entry) => {
    const document = shared.documents.find((candidate) => candidate.id === entry.document_id);
    if (!document) return [];
    const date = parseClearDate(entry.value);
    return [{ key: `${entry.document_id}-${entry.field}`, label: entry.label, filename: document.filename, value: entry.value, days: date ? daysBetween(today, date) : null }];
  });
  const ahead = items.filter((item) => item.days !== null && item.days >= 0).sort((a, b) => a.days! - b.days!);
  const passed = items.filter((item) => item.days !== null && item.days < 0).sort((a, b) => b.days! - a.days!);
  const loose = items.filter((item) => item.days === null);
  return [...ahead, ...passed, ...loose];
}

/** "In 10 days", "Today", "Tomorrow", "3 days ago": how far a date is, or nothing for a loose phrase. */
export function daysAwayText(days: number | null): string | null {
  if (days === null) return null;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return days > 0 ? `In ${days} days` : `${-days} days ago`;
}

export type AttentionItem = { key: string; filename: string; what: string };

/** What the viewer should know is not settled: documents that could not be read well, and questions still open in the rest. */
export function needsAttention(documents: SharedDashboard["documents"], insights: InsightFromApi[]): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const document of documents) {
    if (document.status === "failed") items.push({ key: `${document.id}-read`, filename: document.filename, what: "Could not be read" });
    else if (document.status === "needs_retake") items.push({ key: `${document.id}-read`, filename: document.filename, what: "Hard to read, a clearer copy is needed" });
    const open = insights.find((insight) => insight.document_id === document.id)?.open_count ?? 0;
    if (open > 0) items.push({ key: `${document.id}-open`, filename: document.filename, what: open === 1 ? "1 thing still to ask" : `${open} things still to ask` });
  }
  return items;
}
