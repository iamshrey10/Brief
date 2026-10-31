import { isInProgress, type DocumentSummary } from "@/lib/documents";

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
