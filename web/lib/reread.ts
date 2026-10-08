import type { DocumentSummary } from "@/lib/documents";

export type RereadOutcome = { ok: true; document: DocumentSummary } | { ok: false; message: string };

/** Plain-language messages for each way asking for a fresh read can fail. */
export function messageForRereadFailure(status: number): string {
  switch (status) {
    case 401:
      return "Your session expired. Sign in again to read this again.";
    case 404:
      return "That document is no longer here.";
    case 409:
      return "This document can't be read again right now.";
    case 429:
      return "Too many requests at once. Wait a few seconds and try again.";
    default:
      return "Couldn't start that just now. Try again in a moment.";
  }
}

/** Asks for a document that was already read to be read again from its file. */
export async function rereadDocument(documentId: string): Promise<RereadOutcome> {
  try {
    const res = await fetch(`/api/backend/documents/${encodeURIComponent(documentId)}/reread`, {
      method: "POST",
    });
    if (!res.ok) return { ok: false, message: messageForRereadFailure(res.status) };
    return { ok: true, document: (await res.json()) as DocumentSummary };
  } catch {
    return { ok: false, message: messageForRereadFailure(0) };
  }
}
