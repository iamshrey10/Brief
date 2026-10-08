import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messageForRereadFailure, rereadDocument } from "./reread";

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

describe("rereadDocument", () => {
  it("posts to that document's reread route and returns the updated document", async () => {
    const updated = { id: "d1", filename: "a.pdf", doc_type: "lease", status: "uploaded", ocr_confidence: null };
    fetchMock.mockResolvedValue(response(updated));

    expect(await rereadDocument("d1")).toEqual({ ok: true, document: updated });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/backend/documents/d1/reread");
    expect(init.method).toBe("POST");
  });

  it("encodes the document id", async () => {
    fetchMock.mockResolvedValue(response({}));

    await rereadDocument("a/b c");

    expect(fetchMock.mock.calls[0][0]).toBe("/api/backend/documents/a%2Fb%20c/reread");
  });

  it.each([
    [401, /session expired/i],
    [404, /no longer here/i],
    [409, /can't be read again/i],
    [429, /too many requests/i],
    [500, /couldn't start/i],
  ])("says what went wrong for a %i", async (status, expected) => {
    fetchMock.mockResolvedValue(response({}, status));

    const outcome = await rereadDocument("d1");

    expect(outcome).toEqual({ ok: false, message: expect.stringMatching(expected) });
  });

  it("says it could not start when the request itself fails", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));

    expect(await rereadDocument("d1")).toEqual({
      ok: false,
      message: messageForRereadFailure(0),
    });
  });

  it("gives each known status its own message", () => {
    const messages = [401, 404, 409, 429, 500].map(messageForRereadFailure);
    expect(new Set(messages).size).toBe(5);
    for (const message of messages) expect(message).not.toContain("—");
  });
});
