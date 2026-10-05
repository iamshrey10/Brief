export type KeyTerm = {
  name: string;
  label: string;
  found: boolean;
  value: string | null;
  clause_id: string | null;
  page_number: number | null;
  quote: string | null;
};

export type KeyTermsResult = { terms: KeyTerm[]; truncated: boolean };

export type ChecklistEvidence = { clause_id: string; page_number: number; quote: string };

export type ChecklistAnswer = {
  id: string;
  question: string;
  why_it_matters: string;
  importance: "high" | "medium";
  status: "answered" | "not_mentioned";
  answer: string | null;
  evidence: ChecklistEvidence[];
  // An important question the document does not answer.
  gap: boolean;
  // How to put it to the other side, present only when the document did not answer.
  ask_them: string | null;
};

export type ChecklistResult = { answers: ChecklistAnswer[]; truncated: boolean };

export type LoadOutcome<T> = { ok: true; result: T } | { ok: false; message: string };

// The first request for a document reads all of it with a model, a few seconds and
// occasionally much longer, so the browser gives up rather than showing a skeleton forever.
const TIMEOUT_MS = 90_000;

/** Plain-language messages for each way reading a document can fail, never a raw status. */
export function messageForFailure(status: number): string {
  switch (status) {
    case 401:
      return "Your session expired. Sign in again to see this.";
    case 409:
      return "This document isn't ready to be read yet. Try again once it finishes processing.";
    case 429:
      return "Too many requests at once. Wait a few seconds and try again.";
    default:
      return "I couldn't read this document just now. Try again in a moment.";
  }
}

// One request per document and kind at a time. React's development mode runs effects twice,
// and a second click on Try again should not start a second whole-document read, which is a
// model call, so concurrent callers share the same request.
const inFlight = new Map<string, Promise<LoadOutcome<unknown>>>();

async function request<T>(documentId: string, kind: string): Promise<LoadOutcome<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`/api/backend/documents/${encodeURIComponent(documentId)}/${kind}`, {
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, message: messageForFailure(res.status) };
    return { ok: true, result: (await res.json()) as T };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, message: "That took too long. Try again in a moment." };
    }
    return { ok: false, message: messageForFailure(0) };
  } finally {
    clearTimeout(timer);
  }
}

function load<T>(documentId: string, kind: string): Promise<LoadOutcome<T>> {
  const key = `${documentId}/${kind}`;
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<LoadOutcome<T>>;

  const started = request<T>(documentId, kind).finally(() => inFlight.delete(key));
  inFlight.set(key, started);
  return started;
}

export const fetchKeyTerms = (documentId: string) => load<KeyTermsResult>(documentId, "key-terms");
export const fetchChecklist = (documentId: string) => load<ChecklistResult>(documentId, "checklist");

/** Splits key terms into the ones the document states and the ones it doesn't. */
export function splitKeyTerms(terms: KeyTerm[]): { found: KeyTerm[]; notMentioned: KeyTerm[] } {
  return {
    found: terms.filter((term) => term.found),
    notMentioned: terms.filter((term) => !term.found),
  };
}

/**
 * Groups checklist answers for reading: gaps first, because a clause the document leaves
 * out is the thing a plain chatbot never points out, then what it does answer, then the
 * less important questions it is silent on. Each group keeps the checklist's own order.
 */
export function groupChecklist(answers: ChecklistAnswer[]): {
  gaps: ChecklistAnswer[];
  answered: ChecklistAnswer[];
  otherNotMentioned: ChecklistAnswer[];
} {
  return {
    gaps: answers.filter((a) => a.status === "not_mentioned" && a.gap),
    answered: answers.filter((a) => a.status === "answered"),
    otherNotMentioned: answers.filter((a) => a.status === "not_mentioned" && !a.gap),
  };
}
