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

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
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

describe("the reference on a failed question", () => {
  const ID = { "X-Request-ID": "3f2b8c1e-9d4a-4e07-8a55-0c1d2e3f4a5b" };
  const fetchMock = vi.fn();

  afterEach(() => fetchMock.mockReset());

  it("is the short code of the request id when the server answers with an error", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(jsonResponse({ detail: "boom" }, 502, ID));

    expect(await askQuestion("doc-1", "What is the rent?")).toEqual({
      ok: false,
      message: messageForFailure(502),
      reference: "3f2b8c1e",
    });
  });

  it("is on a daily limit refusal too", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: "You have used all of today's questions." }, 429, ID),
    );

    expect(await askQuestion("doc-1", "x")).toMatchObject({ ok: false, reference: "3f2b8c1e" });
  });

  it("is left out when the server sent no id or nothing reached the server", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "boom" }, 502));
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

    const noId = await askQuestion("doc-1", "x");
    const unreachable = await askQuestion("doc-1", "x");

    expect("reference" in noId).toBe(false);
    expect("reference" in unreachable).toBe(false);
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

  it("shows the server's own sentence when the daily limit of questions is reached", async () => {
    const detail = "You have reached today's limit of 100 questions. Try again tomorrow.";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ detail }, 429)));

    expect(await askQuestion("doc", "q")).toEqual({ ok: false, message: detail });
  });

  it("keeps the wait a few seconds advice for the per minute limit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "too many requests" }, 429)));

    const outcome = await askQuestion("doc", "q");

    expect(outcome.ok === false && outcome.message).toMatch(/faster than/i);
  });

  it("does not show a detail from any other kind of failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ detail: "internal traceback text" }, 500)));

    const outcome = await askQuestion("doc", "q");

    expect(outcome.ok === false && outcome.message).toMatch(/something went wrong/i);
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
