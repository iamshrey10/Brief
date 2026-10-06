const GENERIC_START_FAILURE = "could not start the upload";

/**
 * What to tell the reader when the server refused to start an upload. A refusal for a reason the
 * reader can act on (too many documents, a file that is too large) comes with its own plain
 * sentence, which is shown as written. Anything else, a server error or an odd response, gets the
 * generic line rather than whatever text happened to come back.
 */
export async function startFailureMessage(response: Pick<Response, "status" | "json">): Promise<string> {
  if (response.status < 400 || response.status >= 500 || response.status === 401 || response.status === 429) {
    return GENERIC_START_FAILURE;
  }
  try {
    const body = await response.json();
    const detail = body?.detail;
    if (typeof detail === "string" && detail.trim() !== "") return detail;
  } catch {
    // Not JSON, so there is nothing more specific to say.
  }
  return GENERIC_START_FAILURE;
}
