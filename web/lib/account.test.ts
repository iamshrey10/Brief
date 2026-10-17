import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteAccount, messageForAccountDeleteFailure } from "./account";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const response = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => body,
  }) as Response;

describe("the reference on a failed account delete", () => {
  it("is added after the message when the server answers with an error", async () => {
    fetchMock.mockResolvedValue(
      response(502, {}, { "X-Request-ID": "3f2b8c1e-9d4a-4e07-8a55-0c1d2e3f4a5b" }),
    );

    expect(await deleteAccount()).toEqual({
      ok: false,
      message: `${messageForAccountDeleteFailure(502)} Reference: 3f2b8c1e`,
    });
  });

  it("is left out when the server sent no id", async () => {
    fetchMock.mockResolvedValue(response(502));

    expect(await deleteAccount()).toEqual({ ok: false, message: messageForAccountDeleteFailure(502) });
  });
});

describe("deleteAccount", () => {
  it("sends a DELETE to the account route and says it worked on a 204", async () => {
    fetchMock.mockResolvedValue(response(204));

    expect(await deleteAccount()).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/backend/me");
    expect(init.method).toBe("DELETE");
  });

  it.each([
    [401, /session expired/i],
    [429, /too many requests/i],
    [502, /nothing more was deleted|could not remove|try again/i],
    [500, /try again/i],
  ])("says what went wrong for a %i", async (status, expected) => {
    fetchMock.mockResolvedValue(response(status));

    expect(await deleteAccount()).toEqual({ ok: false, message: expect.stringMatching(expected) });
  });

  it("does not count a 404 as success, since an account has no already-gone state to accept", async () => {
    fetchMock.mockResolvedValue(response(404));

    expect((await deleteAccount()).ok).toBe(false);
  });

  it("only counts a 204 as deleted, not some other success such as a page returned by mistake", async () => {
    for (const status of [200, 201, 202]) {
      fetchMock.mockResolvedValue(response(status));

      expect((await deleteAccount()).ok).toBe(false);
    }
  });

  it("says it could not delete when the request itself fails", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));

    expect(await deleteAccount()).toEqual({ ok: false, message: messageForAccountDeleteFailure(0) });
  });

  it("tells a partly finished delete to be tried again, and gives each status its own words", () => {
    const messages = [401, 429, 502, 500].map(messageForAccountDeleteFailure);

    expect(messageForAccountDeleteFailure(502)).toMatch(/some of your files|try again/i);
    expect(new Set(messages).size).toBeGreaterThanOrEqual(3);
    for (const message of messages) expect(message).not.toContain("—");
  });
});
