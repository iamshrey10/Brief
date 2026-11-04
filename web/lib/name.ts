import type { ActionOutcome } from "@/lib/document-actions";
import { referenceFrom, withReference } from "@/lib/reference";

export const MAX_NAME_LENGTH = 50;

/** Plain-language messages for each way saving a name can fail. */
export function messageForNameFailure(status: number): string {
  switch (status) {
    case 401:
      return "Your session expired. Sign in again to save your name.";
    case 422:
      return "Use letters, spaces, hyphens, apostrophes or full stops, up to 50 characters each.";
    case 429:
      return "Too many requests at once. Wait a few seconds and try again.";
    default:
      return "Couldn't save your name just now. Try again in a moment.";
  }
}

/** Saves the person's first and last name. */
export async function saveName(first: string, last: string): Promise<ActionOutcome<{ first_name: string; last_name: string }>> {
  try {
    const res = await fetch("/api/backend/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ first_name: first.trim(), last_name: last.trim() }),
    });
    if (!res.ok) return { ok: false, message: withReference(messageForNameFailure(res.status), referenceFrom(res)) };
    const saved = await res.json();
    return { ok: true, result: { first_name: saved.first_name, last_name: saved.last_name } };
  } catch {
    return { ok: false, message: messageForNameFailure(0) };
  }
}
