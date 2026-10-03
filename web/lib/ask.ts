export type AskCitation = {
  clause_id: string;
  page_number: number;
  clause_text: string;
  quote: string;
};

export type AskResult = {
  found: boolean;
  answer: string;
  citations: AskCitation[];
};

export type AskOutcome = { ok: true; result: AskResult } | { ok: false; message: string };

export const MAX_QUESTION_LENGTH = 1000;

// Answers wait on an LLM, usually a few seconds but occasionally far longer, so the
// browser gives up rather than leaving someone staring at a spinner forever.
const TIMEOUT_MS = 60_000;

/** Plain-language messages for each way asking can fail, never a raw status code. */
export function messageForFailure(status: number): string {
  switch (status) {
    case 401:
      return "Your session expired. Sign in again to keep asking questions.";
    case 409:
      return "This document isn't ready to ask about yet. Try again once it finishes processing.";
    case 422:
      return `That question is too long. Try keeping it under ${MAX_QUESTION_LENGTH} characters.`;
    case 429:
      return "You're asking faster than I can answer. Wait a few seconds and try again.";
    default:
      return "Something went wrong getting an answer. Try again in a moment.";
  }
}

export async function askQuestion(documentId: string, question: string): Promise<AskOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`/api/backend/documents/${encodeURIComponent(documentId)}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, message: messageForFailure(res.status) };
    return { ok: true, result: (await res.json()) as AskResult };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, message: "That took too long. Try asking again." };
    }
    return { ok: false, message: messageForFailure(0) };
  } finally {
    clearTimeout(timer);
  }
}
