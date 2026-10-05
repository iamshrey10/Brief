import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messageForRetryFailure, retryDocument } from "./retry";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const response = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe("retryDocument", () => {
  it("posts to that document's retry route and returns the updated document", async () => {
    const updated = { id: "d1", filename: "a.pdf", doc_type: "lease", status: "uploaded", ocr_confidence: null };
    fetchMock.mockResolvedValue(response(updated));

    expect(await retryDocument("d1")).toEqual({ ok: true, document: updated });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/backend/documents/d1/retry");
    expect(init.method).toBe("POST");
  });

  it("encodes the document id", async () => {
    fetchMock.mockResolvedValue(response({}));

    await retryDocument("a/b c");

    expect(fetchMock.mock.calls[0][0]).toBe("/api/backend/documents/a%2Fb%20c/retry");
  });

  it.each([
    [401, /session expired/i],
    [404, /no longer here/i],
    [409, /already being read/i],
    [429, /too many requests/i],
    [500, /couldn't start that/i],
  ])("explains a %i in plain words", async (status, pattern) => {
    fetchMock.mockResolvedValue(response({ detail: "x" }, status));

    const outcome = await retryDocument("d1");

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.message).toMatch(pattern);
  });

  it("explains a network failure in plain words", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await retryDocument("d1")).toEqual({ ok: false, message: messageForRetryFailure(0) });
  });

  it("never shows a status code to the reader", () => {
    for (const status of [401, 404, 409, 429, 500, 0]) {
      expect(messageForRetryFailure(status)).not.toMatch(/\b(401|404|409|429|500)\b/);
    }
  });
});
