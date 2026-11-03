import { daysBetween, localToday, parseClearDate } from "@/lib/dates";

export type LeaseEnd = { documentId: string; filename: string; value: string; days: number };

type KeyDateFromApi = { document_id?: unknown; field?: unknown; value?: unknown };

/** What the backend sent for /me/key-dates, or nothing at all when it was not an array. */
export function asKeyDates(body: unknown): { document_id: string; field: string; value: string }[] {
  if (!Array.isArray(body)) return [];
  return (body as KeyDateFromApi[]).flatMap((item) =>
    item && typeof item.document_id === "string" && typeof item.field === "string" && typeof item.value === "string"
      ? [{ document_id: item.document_id, field: item.field, value: item.value }]
      : [],
  );
}

/**
 * The lease that ends soonest and has not ended yet, with the days left. A loose date such as "6 months
 * after move-in" is left out, since it cannot be counted down to. When every lease has ended, the one that ended
 * most recently is shown with a negative number, so the card can say so instead of vanishing.
 */
export function nextLeaseEnd(
  keyDates: { document_id: string; field: string; value: string }[],
  documents: { id: string; filename: string }[],
  now: Date = new Date(),
): LeaseEnd | null {
  const today = localToday(now);
  const ends: LeaseEnd[] = [];
  for (const entry of keyDates) {
    if (entry.field !== "lease_end") continue;
    const date = parseClearDate(entry.value);
    const document = documents.find((candidate) => candidate.id === entry.document_id);
    if (date && document) ends.push({ documentId: document.id, filename: document.filename, value: entry.value, days: daysBetween(today, date) });
  }
  const upcoming = ends.filter((end) => end.days >= 0).sort((a, b) => a.days - b.days);
  if (upcoming.length > 0) return upcoming[0];
  return ends.sort((a, b) => b.days - a.days)[0] ?? null;
}
