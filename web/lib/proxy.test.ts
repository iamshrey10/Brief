import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/require-session", () => ({ requireSession: vi.fn() }));

import { requireSession } from "@/lib/require-session";
import { proxyDelete, proxyGet, proxyPatch, proxyPost } from "./proxy";

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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
    expect(init.headers).toEqual({
      Authorization: "Bearer signed-token",
      "X-Request-ID": expect.stringMatching(UUID),
    });
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
    expect(init.headers).toEqual({ Authorization: "Bearer signed-token", "X-Request-ID": expect.stringMatching(UUID) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "uploaded" });
  });

  it("sends a JSON body when it is given one", async () => {
    fetchMock.mockResolvedValue(backendResponse({ id: "d9" }));

    await proxyPost("/documents", { filename: "Lease.pdf", doc_type: "lease" });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe('{"filename":"Lease.pdf","doc_type":"lease"}');
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

describe("proxyPatch", () => {
  it("sends the changes as JSON with the signed token", async () => {
    fetchMock.mockResolvedValue(backendResponse({ filename: "New.pdf" }));

    const res = await proxyPatch("/documents/d1", { filename: "New.pdf" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/documents/d1");
    expect(init.method).toBe("PATCH");
    expect(init.headers).toEqual({
      Authorization: "Bearer signed-token",
      "X-Request-ID": expect.stringMatching(UUID),
      "Content-Type": "application/json",
    });
    expect(init.body).toBe('{"filename":"New.pdf"}');
    expect(await res.json()).toEqual({ filename: "New.pdf" });
  });

  it("is refused without calling the backend when the user is not allowed", async () => {
    sessionMock.mockResolvedValue({ error: Response.json({ error: "not signed in" }, { status: 401 }) });

    expect((await proxyPatch("/documents/d1", {})).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the backend's refusal as it is", async () => {
    fetchMock.mockResolvedValue(backendResponse({ detail: "bad name" }, 422));

    const res = await proxyPatch("/documents/d1", { filename: "" });

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ detail: "bad name" });
  });

  it("answers with a clean 502 when the backend cannot be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    expect((await proxyPatch("/documents/d1", {})).status).toBe(502);
  });
});

describe("proxyDelete", () => {
  it("sends a DELETE with the signed token and no body", async () => {
    fetchMock.mockResolvedValue({ status: 204 } as Response);

    await proxyDelete("/documents/d1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/documents/d1");
    expect(init.method).toBe("DELETE");
    expect(init.headers).toEqual({ Authorization: "Bearer signed-token", "X-Request-ID": expect.stringMatching(UUID) });
    expect(init.body).toBeUndefined();
  });

  it("passes a 204, which has no body to read, straight through", async () => {
    fetchMock.mockResolvedValue({
      status: 204,
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
    } as unknown as Response);

    const res = await proxyDelete("/documents/d1");

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("is refused without calling the backend when the user is not allowed", async () => {
    sessionMock.mockResolvedValue({ error: Response.json({ error: "too many requests" }, { status: 429 }) });

    expect((await proxyDelete("/documents/d1")).status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the backend's refusal as it is", async () => {
    fetchMock.mockResolvedValue(backendResponse({ detail: "document not found" }, 404));

    expect((await proxyDelete("/documents/d1")).status).toBe(404);
  });

  it("answers with a clean 502 when the backend cannot be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    expect((await proxyDelete("/documents/d1")).status).toBe(502);
  });
});

describe("a request without a body sends no content type", () => {
  it("leaves the header out for GET and POST", async () => {
    fetchMock.mockResolvedValue(backendResponse({}));

    await proxyGet("/a");
    await proxyPost("/b");

    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: "Bearer signed-token", "X-Request-ID": expect.stringMatching(UUID) });
    expect(fetchMock.mock.calls[1][1].headers).toEqual({ Authorization: "Bearer signed-token", "X-Request-ID": expect.stringMatching(UUID) });
  });
});

describe("the request id", () => {
  const sentId = () => fetchMock.mock.calls.at(-1)![1].headers["X-Request-ID"] as string;

  it("is new for every request, so two requests never share one in the logs", async () => {
    fetchMock.mockResolvedValue(backendResponse({}));

    await proxyGet("/documents");
    const first = sentId();
    await proxyGet("/documents");

    expect(sentId()).not.toBe(first);
  });

  it("is handed back to the browser, so a person can quote it when something goes wrong", async () => {
    fetchMock.mockResolvedValue(backendResponse({ ok: true }));

    const res = await proxyGet("/documents");

    expect(res.headers.get("X-Request-ID")).toBe(sentId());
  });

  it("is handed back on an error from the backend too", async () => {
    fetchMock.mockResolvedValue(backendResponse({ detail: "nope" }, 409));

    const res = await proxyPost("/documents/d1/retry");

    expect(res.headers.get("X-Request-ID")).toBe(sentId());
  });

  it("is handed back when the backend cannot be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    const res = await proxyGet("/documents");

    expect(res.status).toBe(502);
    expect(res.headers.get("X-Request-ID")).toBe(sentId());
  });

  it("is handed back on a delete, which has no body", async () => {
    fetchMock.mockResolvedValue({ status: 204 } as Response);

    const res = await proxyDelete("/documents/d1");

    expect(res.status).toBe(204);
    expect(res.headers.get("X-Request-ID")).toBe(sentId());
  });

  it("is on a refusal too, so a person who is not signed in or is rate limited can still quote one", async () => {
    sessionMock.mockResolvedValue({
      error: Response.json({ error: "too many requests" }, { status: 429 }),
    });

    const res = await proxyGet("/documents");

    expect(res.status).toBe(429);
    expect(res.headers.get("X-Request-ID")).toMatch(UUID);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
