import { afterEach, describe, expect, it, vi } from "vitest";
import { askQuestion, MAX_QUESTION_LENGTH, messageForFailure, type AskResult } from "./ask";

const answer: AskResult = {
  found: true,
  answer: "Yes, with no penalty.",
  citations: [
    {
      clause_id: "clause-1",
      page_number: 2,
      clause_text: "The borrower may prepay at any time without penalty.",
      quote: "without penalty",
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("messageForFailure", () => {
  it.each([
    [401, /session expired/i],
    [409, /isn't ready/i],
    [422, /too long/i],
    [429, /faster than/i],
    [500, /something went wrong/i],
    [502, /something went wrong/i],
    [0, /something went wrong/i],
  ])("explains status %i in plain language", (status, expected) => {
    expect(messageForFailure(status)).toMatch(expected);
  });

  it("never shows a raw status code to the reader", () => {
    for (const status of [401, 409, 422, 429, 500, 502]) {
      expect(messageForFailure(status)).not.toMatch(/\b(401|409|422|429|500|502)\b/);
    }
  });

  it("states the real question length limit", () => {
    expect(messageForFailure(422)).toContain(String(MAX_QUESTION_LENGTH));
  });
});

describe("askQuestion", () => {
  it("posts the question to the document's ask route and returns the answer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(answer));
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await askQuestion("doc-123", "Can I pay early?");

    expect(outcome).toEqual({ ok: true, result: answer });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/backend/documents/doc-123/ask");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ question: "Can I pay early?" });
  });

  it("encodes the document id so it cannot change the request path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(answer));
    vi.stubGlobal("fetch", fetchMock);

    await askQuestion("a/b?c", "anything");

    expect(fetchMock.mock.calls[0][0]).toBe("/api/backend/documents/a%2Fb%3Fc/ask");
  });

  it("passes a not-found answer through as a normal result, not a failure", async () => {
    const notFound: AskResult = { found: false, answer: "I couldn't find this.", citations: [] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(notFound)));

    expect(await askQuestion("doc", "q")).toEqual({ ok: true, result: notFound });
  });

  it("turns an error response into a plain-language failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "too many" }, 429)));

    const outcome = await askQuestion("doc", "q");

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toMatch(/faster than/i);
  });

  it("turns a network error into a generic failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const outcome = await askQuestion("doc", "q");

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toMatch(/something went wrong/i);
  });

  it("turns a success response with an unreadable body into a generic failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json", { status: 200 })));

    const outcome = await askQuestion("doc", "q");

    expect(outcome.ok).toBe(false);
  });

  it("gives up after the timeout with a specific message", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
            );
          }),
      ),
    );

    const pending = askQuestion("doc", "q");
    await vi.advanceTimersByTimeAsync(60_000);

    expect(await pending).toEqual({ ok: false, message: "That took too long. Try asking again." });
  });

  it("does not leave its timeout running once it has an answer", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(answer)));

    await askQuestion("doc", "q");

    expect(vi.getTimerCount()).toBe(0);
  });
});
