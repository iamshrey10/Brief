import type { DocumentSummary } from "@/lib/documents";

export type RetryOutcome = { ok: true; document: DocumentSummary } | { ok: false; message: string };

/** Plain-language messages for each way asking for another try can fail. */
export function messageForRetryFailure(status: number): string {
  switch (status) {
    case 401:
      return "Your session expired. Sign in again to try this.";
    case 404:
      return "That document is no longer here.";
    case 409:
      return "This document is already being read, or doesn't need another try.";
    case 429:
      return "Too many requests at once. Wait a few seconds and try again.";
    default:
      return "Couldn't start that just now. Try again in a moment.";
  }
}

/** Asks for a document to be read again. */
export async function retryDocument(documentId: string): Promise<RetryOutcome> {
  try {
    const res = await fetch(`/api/backend/documents/${encodeURIComponent(documentId)}/retry`, {
      method: "POST",
    });
    if (!res.ok) return { ok: false, message: messageForRetryFailure(res.status) };
    return { ok: true, document: (await res.json()) as DocumentSummary };
  } catch {
    return { ok: false, message: messageForRetryFailure(0) };
  }
}
