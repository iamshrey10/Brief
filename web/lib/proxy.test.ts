import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/require-session", () => ({ requireSession: vi.fn() }));

import { requireSession } from "@/lib/require-session";
import { proxyGet, proxyPost } from "./proxy";

const sessionMock = vi.mocked(requireSession);
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  sessionMock.mockResolvedValue({ token: "signed-token" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  sessionMock.mockReset();
});

const backendResponse = (body: unknown, status = 200) =>
  ({ status, json: async () => body }) as Response;

describe("proxyGet", () => {
  it("returns the session error and never calls the backend when the user is not allowed", async () => {
    sessionMock.mockResolvedValue({
      error: Response.json({ error: "not signed in" }, { status: 401 }),
    });

    const res = await proxyGet("/documents/d1/key-terms");

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls the backend with the signed token and without caching", async () => {
    fetchMock.mockResolvedValue(backendResponse({ terms: [] }));

    await proxyGet("/documents/d1/key-terms");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/documents/d1/key-terms");
    expect(init.headers).toEqual({ Authorization: "Bearer signed-token" });
    expect(init.cache).toBe("no-store");
  });

  it("passes the backend's body and status straight through", async () => {
    fetchMock.mockResolvedValue(backendResponse({ terms: [1, 2], truncated: false }));

    const res = await proxyGet("/documents/d1/key-terms");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ terms: [1, 2], truncated: false });
  });

  it.each([404, 409, 502])("keeps a %i from the backend as it is", async (status) => {
    fetchMock.mockResolvedValue(backendResponse({ detail: "nope" }, status));

    const res = await proxyGet("/documents/d1/checklist");

    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ detail: "nope" });
  });

  it("answers with a clean 502 when the backend cannot be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    const res = await proxyGet("/documents/d1/checklist");

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ detail: "could not reach the reading service" });
  });

  it("answers with a clean 502 when the backend replies with something that is not JSON", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    } as unknown as Response);

    const res = await proxyGet("/documents/d1/checklist");

    expect(res.status).toBe(502);
  });
});

describe("proxyPost", () => {
  it("sends a POST to the backend with the signed token", async () => {
    fetchMock.mockResolvedValue(backendResponse({ status: "uploaded" }));

    const res = await proxyPost("/documents/d1/retry");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/documents/d1/retry");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: "Bearer signed-token" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "uploaded" });
  });

  it("is refused without calling the backend when the user is not allowed", async () => {
    sessionMock.mockResolvedValue({
      error: Response.json({ error: "too many requests" }, { status: 429 }),
    });

    const res = await proxyPost("/documents/d1/retry");

    expect(res.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the backend's refusal as it is", async () => {
    fetchMock.mockResolvedValue(backendResponse({ detail: "no" }, 409));

    expect((await proxyPost("/documents/d1/retry")).status).toBe(409);
  });

  it("answers with a clean 502 when the backend cannot be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    expect((await proxyPost("/documents/d1/retry")).status).toBe(502);
  });
});

describe("proxyGet uses GET", () => {
  it("says GET explicitly", async () => {
    fetchMock.mockResolvedValue(backendResponse({}));

    await proxyGet("/documents/d1/key-terms");

    expect(fetchMock.mock.calls[0][1].method).toBe("GET");
  });
});
