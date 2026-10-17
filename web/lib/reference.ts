const LOOKS_LIKE_AN_ID = /^[A-Za-z0-9-]{8,64}$/;

/**
 * A short code a person can quote when something fails, taken from the request id the server sent.
 * Every log line for that request starts with the same id, so the code finds it. Nothing is returned
 * for a missing or odd-looking id, so text that did not come from us is never shown to anyone.
 */
export function referenceFrom(response: Response): string | undefined {
  const id = response.headers.get("X-Request-ID");
  if (!id || !LOOKS_LIKE_AN_ID.test(id)) return undefined;
  return id.slice(0, 8);
}

/** The message with the reference after it, for a place that shows only a line of text. */
export function withReference(message: string, reference: string | undefined): string {
  return reference ? `${message} Reference: ${reference}` : message;
}
