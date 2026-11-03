import type { DocumentSummary } from "@/lib/documents";
import { referenceFrom, withReference } from "@/lib/reference";

export type ActionOutcome<T> = { ok: true; result: T } | { ok: false; message: string };

/** Plain-language messages for each way deleting a document can fail, never a raw status. */
export function messageForDeleteFailure(status: number): string {
  switch (status) {
    case 401:
      return "Your session expired. Sign in again to delete this.";
    case 404:
      return "That document is no longer here.";
    case 429:
      return "Too many requests at once. Wait a few seconds and try again.";
    default:
      return "Couldn't delete that just now. Nothing was removed, so try again in a moment.";
  }
}

/** Plain-language messages for each way renaming or changing a document can fail. */
export function messageForUpdateFailure(status: number): string {
  switch (status) {
    case 401:
      return "Your session expired. Sign in again to save this.";
    case 404:
      return "That document is no longer here.";
    case 422:
      return "That name or kind isn't allowed. Use a name of up to 200 characters.";
    case 429:
      return "Too many requests at once. Wait a few seconds and try again.";
    default:
      return "Couldn't save that just now. Try again in a moment.";
  }
}

export const MAX_FILENAME_LENGTH = 200;

/** Plain-language messages for each way bringing a document back from the bin can fail. */
export function messageForRestoreFailure(status: number): string {
  switch (status) {
    case 401:
      return "Your session expired. Sign in again to restore this.";
    case 404:
      return "That document is no longer in the bin. It may have been here longer than seven days.";
    case 409:
      return "You already have the most documents you can keep. Delete one you no longer need, then restore this.";
    case 429:
      return "Too many requests at once. Wait a few seconds and try again.";
    default:
      return "Couldn't restore that just now. It is still in the bin, so try again in a moment.";
  }
}

/** Moves a document to the bin. Its file and everything Brief read from it stay, and it can be restored for seven days. */
export async function deleteDocument(documentId: string): Promise<ActionOutcome<null>> {
  try {
    const res = await fetch(`/api/backend/documents/${encodeURIComponent(documentId)}`, {
      method: "DELETE",
    });
    // A 404 means it is already gone, which is what was asked for, so it counts as done.
    if (res.status === 204 || res.status === 404) return { ok: true, result: null };
    return { ok: false, message: withReference(messageForDeleteFailure(res.status), referenceFrom(res)) };
  } catch {
    return { ok: false, message: messageForDeleteFailure(0) };
  }
}

export type DocumentChanges = { filename?: string; doc_type?: string };

/** Renames a document and/or changes what kind of document it is. */
export async function updateDocument(
  documentId: string,
  changes: DocumentChanges,
): Promise<ActionOutcome<DocumentSummary>> {
  try {
    const res = await fetch(`/api/backend/documents/${encodeURIComponent(documentId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    if (!res.ok) {
      return { ok: false, message: withReference(messageForUpdateFailure(res.status), referenceFrom(res)) };
    }
    return { ok: true, result: (await res.json()) as DocumentSummary };
  } catch {
    return { ok: false, message: messageForUpdateFailure(0) };
  }
}

/** Brings a document back from the bin, as it was. */
export async function restoreDocument(documentId: string): Promise<ActionOutcome<DocumentSummary>> {
  try {
    const res = await fetch(`/api/backend/documents/${encodeURIComponent(documentId)}/restore`, { method: "POST" });
    if (res.ok) return { ok: true, result: await res.json() };
    return { ok: false, message: withReference(messageForRestoreFailure(res.status), referenceFrom(res)) };
  } catch {
    return { ok: false, message: messageForRestoreFailure(0) };
  }
}

/** Deletes a document from the bin for good: its file, and everything Brief read from it. A document that is already gone counts as done. */
export async function deleteForGood(documentId: string): Promise<ActionOutcome<null>> {
  try {
    const res = await fetch(`/api/backend/documents/${encodeURIComponent(documentId)}/permanent`, { method: "DELETE" });
    if (res.status === 204 || res.status === 404) return { ok: true, result: null };
    return { ok: false, message: withReference(messageForDeleteFailure(res.status), referenceFrom(res)) };
  } catch {
    return { ok: false, message: messageForDeleteFailure(0) };
  }
}
