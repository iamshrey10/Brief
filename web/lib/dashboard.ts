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

/** What the backend says it has already worked out about one document. A part is null until Brief has done that part. */
export type InsightFromApi = {
  document_id: string;
  terms_found: number | null;
  terms_total: number | null;
  questions_answered: number | null;
  open_count: number | null;
  open_questions: string[];
};

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const countOrNull = (value: unknown): number | null => (isCount(value) ? value : null);

/** The insights from the backend's answer, each one cleaned up, and anything not shaped like one left out. */
export function asInsights(body: unknown): InsightFromApi[] {
  if (!Array.isArray(body)) return [];
  const insights: InsightFromApi[] = [];
  for (const entry of body) {
    if (typeof entry?.document_id !== "string") continue;
    insights.push({
      document_id: entry.document_id,
      terms_found: countOrNull(entry.terms_found),
      terms_total: countOrNull(entry.terms_total),
      questions_answered: countOrNull(entry.questions_answered),
      open_count: countOrNull(entry.open_count),
      open_questions: Array.isArray(entry.open_questions) ? entry.open_questions.filter((q: unknown): q is string => typeof q === "string" && q.length > 0) : [],
    });
  }
  return insights;
}

export type OpenQuestionGroup = { documentId: string; filename: string; total: number; questions: string[] };

/** The questions still to ask, grouped by document, the document with the most first. Only documents that are still in the list, and have some. */
export function openQuestionGroups(insights: InsightFromApi[], documents: Pick<DocumentSummary, "id" | "filename">[]): OpenQuestionGroup[] {
  const names = new Map(documents.map((document) => [document.id, document.filename]));
  return insights
    .filter((insight) => names.has(insight.document_id) && insight.open_questions.length > 0)
    .map((insight) => ({
      documentId: insight.document_id,
      filename: names.get(insight.document_id) as string,
      total: insight.open_count ?? insight.open_questions.length,
      questions: insight.open_questions,
    }))
    .sort((a, b) => b.total - a.total);
}
