import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/service-token", () => ({ mintServiceToken: vi.fn().mockResolvedValue("signed-token") }));

import { backendGet } from "./backend";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("backendGet", () => {
  it("asks for the path with a token for that person, never from a cache, and returns what was said", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [{ id: "d1" }] });

    const body = await backendGet("reader@example.com", "/documents");

    expect(body).toEqual([{ id: "d1" }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/documents$/);
    expect(init).toMatchObject({ headers: { Authorization: "Bearer signed-token" }, cache: "no-store" });
  });

  it("gives null, not an error, when the backend refuses", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ detail: "no" }) });

    expect(await backendGet("reader@example.com", "/documents")).toBeNull();
  });

  it("gives null when the backend cannot be reached or does not answer with JSON", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await backendGet("reader@example.com", "/documents")).toBeNull();

    fetchMock.mockResolvedValue({ ok: true, json: async () => Promise.reject(new SyntaxError("not json")) });
    expect(await backendGet("reader@example.com", "/documents")).toBeNull();
  });
});
