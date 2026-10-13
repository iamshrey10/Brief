export type UsageKind = "ask" | "read" | "analyze";
export type UsageEntry = { used: number; limit: number; left: number };
export type Usage = Record<UsageKind, UsageEntry>;

export type UsageOutcome = { ok: true; usage: Usage } | { ok: false };

const KINDS: UsageKind[] = ["ask", "read", "analyze"];

/** How few must be left before the person is told. Until then the page stays quiet. */
const SHOW_WHEN_LEFT_IS_AT_MOST = 10;

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isUsage(value: unknown): value is Usage {
  if (typeof value !== "object" || value === null) return false;
  return KINDS.every((kind) => {
    const entry = (value as Record<string, unknown>)[kind] as Record<string, unknown> | undefined;
    return typeof entry === "object" && entry !== null && isCount(entry.used) && isCount(entry.limit) && isCount(entry.left);
  });
}

/**
 * Where the person stands today against each daily limit. It is only a hint, so every way it can go
 * wrong, a failed request, a bad status, an odd reply, quietly gives nothing instead of an error, and a
 * reply that does not have the expected numbers is thrown away rather than shown.
 */
export async function fetchUsage(): Promise<UsageOutcome> {
  try {
    const res = await fetch("/api/backend/me/usage", { cache: "no-store" });
    if (!res.ok) return { ok: false };
    const body: unknown = await res.json();
    return isUsage(body) ? { ok: true, usage: body } : { ok: false };
  } catch {
    return { ok: false };
  }
}

/**
 * A short note about the daily limit of questions, or null while there is nothing worth saying: plenty
 * is left, or the numbers make no sense.
 */
export function questionsLeftNote(entry: UsageEntry): string | null {
  if (!isCount(entry.limit) || !isCount(entry.left) || entry.limit === 0) return null;
  if (entry.left === 0) return "You have used all of today's questions. Try again tomorrow.";
  if (entry.left > SHOW_WHEN_LEFT_IS_AT_MOST) return null;
  return `${entry.left} ${entry.left === 1 ? "question" : "questions"} left today`;
}
