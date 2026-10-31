import { isInProgress, isReadable, type DocumentSummary } from "@/lib/documents";

export type DocumentStats = { total: number; ready: number; needsAttention: number; reading: number };

/** The numbers at the top of the dashboard: all documents, those ready to open, those that need the person to do something, and those being read now. */
export function documentStats(documents: Pick<DocumentSummary, "status">[]): DocumentStats {
  return {
    total: documents.length,
    ready: documents.filter((document) => document.status === "ready").length,
    // A read that failed, or a scan too poor to trust, is something only the person can fix.
    needsAttention: documents.filter((document) => document.status === "failed" || document.status === "needs_retake").length,
    reading: documents.filter((document) => isInProgress(document.status)).length,
  };
}

/** A document list from the backend's answer, or an empty one when it is not the list expected. */
export function asDocuments(body: unknown): DocumentSummary[] {
  if (!Array.isArray(body)) return [];
  return body.filter(
    (entry): entry is DocumentSummary =>
      typeof entry?.id === "string" && typeof entry?.filename === "string" && typeof entry?.doc_type === "string" && typeof entry?.status === "string",
  );
}

/** How long ago something happened, in the words a person uses: "just now", "5 minutes ago", "yesterday", "3 days ago", or the date once it is old. */
export function formatAgo(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(then.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}

const STATUS_WORDS: Record<string, string> = {
  ready: "Ready to open",
  failed: "Could not be read",
  needs_retake: "Needs a clearer photo",
  pending: "Being read",
  uploaded: "Being read",
  processing: "Being read",
};

export type Activity = { id: string; filename: string; what: string; when: string; openable: boolean };

/** The most recent happenings across the documents, newest first: when each last changed, and what it is like now. */
export function recentActivity(documents: DocumentSummary[], now: Date = new Date(), limit = 5): Activity[] {
  const stamp = (document: DocumentSummary) => Date.parse(document.status_changed_at ?? document.created_at ?? "") || 0;
  return [...documents]
    .sort((a, b) => stamp(b) - stamp(a))
    .slice(0, limit)
    .map((document) => ({
      id: document.id,
      filename: document.filename,
      what: STATUS_WORDS[document.status] ?? document.status,
      when: formatAgo(document.status_changed_at ?? document.created_at, now),
      // Only a document that has text to show opens to anything, the same rule the documents list uses.
      openable: isReadable(document.status),
    }));
}
