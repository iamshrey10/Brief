/** One document in the bin, as the backend describes it. */
export type TrashedDocument = { id: string; filename: string; doc_type: string; deleted_at: string; days_left: number };

/** The bin from the backend's answer, each entry checked, and anything not shaped like one left out. */
export function asTrash(body: unknown): TrashedDocument[] {
  if (!Array.isArray(body)) return [];
  return body.filter(
    (entry): entry is TrashedDocument =>
      typeof entry?.id === "string" &&
      typeof entry?.filename === "string" &&
      typeof entry?.doc_type === "string" &&
      typeof entry?.deleted_at === "string" &&
      typeof entry?.days_left === "number" &&
      Number.isFinite(entry.days_left),
  );
}

/** "7 days left", "1 day left", "Last day". A document with no days left is about to go, and says so. */
export function daysLeftText(days: number): string {
  if (days <= 0) return "Removing soon";
  if (days === 1) return "Last day";
  return `${days} days left`;
}

/** True when the document is about to go and the person should be told more loudly. */
export function isRunningOut(days: number): boolean {
  return days <= 1;
}

/** "Deleted today", "Deleted yesterday", "Deleted Oct 30": when, in the person's own time. */
export function deletedText(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const dayOf = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((dayOf(now) - dayOf(then)) / 86_400_000);
  if (days <= 0) return "Deleted today";
  if (days === 1) return "Deleted yesterday";
  return `Deleted ${then.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}
