import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteDocument,
  messageForDeleteFailure,
  messageForUpdateFailure,
  updateDocument,
} from "./document-actions";

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

describe("deleteDocument", () => {
  it("sends a DELETE to that document's route", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204 } as Response);

    expect(await deleteDocument("d1")).toEqual({ ok: true, result: null });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/backend/documents/d1");
    expect(init.method).toBe("DELETE");
  });

  it("encodes the document id", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204 } as Response);

    await deleteDocument("a/b c");

    expect(fetchMock.mock.calls[0][0]).toBe("/api/backend/documents/a%2Fb%20c");
  });

  it("counts a document that is already gone as deleted, since that is what was asked", async () => {
    fetchMock.mockResolvedValue(response({ detail: "document not found" }, 404));

    expect(await deleteDocument("d1")).toEqual({ ok: true, result: null });
  });

  it.each([
    [401, /session expired/i],
    [429, /too many requests/i],
    [500, /nothing was removed/i],
    [502, /nothing was removed/i],
  ])("explains a %i in plain words", async (status, pattern) => {
    fetchMock.mockResolvedValue(response({ detail: "x" }, status));

    const outcome = await deleteDocument("d1");

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.message).toMatch(pattern);
  });

  it("explains a network failure in plain words and says nothing was removed", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await deleteDocument("d1")).toEqual({ ok: false, message: messageForDeleteFailure(0) });
    expect(messageForDeleteFailure(0)).toMatch(/nothing was removed/i);
  });
});

describe("updateDocument", () => {
  const updated = { id: "d1", filename: "New.pdf", doc_type: "lease", status: "ready", ocr_confidence: null };

  it("sends the changes as JSON in a PATCH to that document's route", async () => {
    fetchMock.mockResolvedValue(response(updated));

    const outcome = await updateDocument("d1", { filename: "New.pdf", doc_type: "lease" });

    expect(outcome).toEqual({ ok: true, result: updated });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/backend/documents/d1");
    expect(init.method).toBe("PATCH");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ filename: "New.pdf", doc_type: "lease" });
  });

  it("sends only what was changed", async () => {
    fetchMock.mockResolvedValue(response(updated));

    await updateDocument("d1", { filename: "Only the name.pdf" });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ filename: "Only the name.pdf" });
  });

  it("encodes the document id", async () => {
    fetchMock.mockResolvedValue(response(updated));

    await updateDocument("a/b c", { filename: "x" });

    expect(fetchMock.mock.calls[0][0]).toBe("/api/backend/documents/a%2Fb%20c");
  });

  it.each([
    [401, /session expired/i],
    [404, /no longer here/i],
    [422, /isn't allowed/i],
    [429, /too many requests/i],
    [500, /couldn't save/i],
  ])("explains a %i in plain words", async (status, pattern) => {
    fetchMock.mockResolvedValue(response({ detail: "x" }, status));

    const outcome = await updateDocument("d1", { filename: "x" });

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.message).toMatch(pattern);
  });

  it("explains a network failure in plain words", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await updateDocument("d1", { filename: "x" })).toEqual({
      ok: false,
      message: messageForUpdateFailure(0),
    });
  });

  it("never shows a status code to the reader", () => {
    for (const status of [401, 404, 422, 429, 500, 0]) {
      expect(messageForUpdateFailure(status)).not.toMatch(/\b(401|404|422|429|500)\b/);
      expect(messageForDeleteFailure(status)).not.toMatch(/\b(401|404|422|429|500)\b/);
    }
  });
});
