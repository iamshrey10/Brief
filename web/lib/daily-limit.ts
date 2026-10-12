/**
 * The sentence to show when the API refused a request because the person reached a daily limit
 * (for questions, document reads or overviews), or null when that is not what happened.
 *
 * Two different things answer with a 429. The API's daily limit carries a plain `detail` sentence
 * that includes the number and says to try tomorrow. The website's own per minute limit carries only
 * an `error`, and "wait a few seconds" is the right advice for that one. So only a 429 with a
 * non-empty text `detail` counts, and any other status or body is left to the usual messages.
 */
export async function dailyLimitMessage(
  response: Pick<Response, "status" | "json">,
): Promise<string | null> {
  if (response.status !== 429) return null;
  try {
    const detail = (await response.json())?.detail;
    return typeof detail === "string" && detail.trim() !== "" ? detail : null;
  } catch {
    return null;
  }
}
