import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/proxy", () => ({ proxyDelete: vi.fn(), proxyGet: vi.fn(), proxyPatch: vi.fn() }));
vi.mock("@/lib/require-session", () => ({ requireSession: vi.fn() }));

import { proxyDelete, proxyGet, proxyPatch } from "@/lib/proxy";
import { DELETE, GET, PATCH } from "./route";

const proxyMock = vi.mocked(proxyDelete);
const getMock = vi.mocked(proxyGet);

beforeEach(() => {
  proxyMock.mockReset();
  proxyMock.mockResolvedValue(new Response(null, { status: 204 }));
});

describe("DELETE /api/backend/me", () => {
  it("asks the backend to delete the signed-in account, and nothing else", async () => {
    await DELETE();

    expect(proxyMock).toHaveBeenCalledTimes(1);
    expect(proxyMock).toHaveBeenCalledWith("/me");
  });

  it("returns whatever the proxy returns, including a failure", async () => {
    proxyMock.mockResolvedValue(Response.json({ detail: "x" }, { status: 502 }));

    const res = await DELETE();

    expect(res.status).toBe(502);
  });

  it("passes a 204 through untouched", async () => {
    const res = await DELETE();

    expect(res.status).toBe(204);
  });
});

describe("GET /api/backend/me", () => {
  it("asks the backend who is signed in through the shared proxy, and nothing else", async () => {
    getMock.mockResolvedValue(Response.json({ id: "u1", email: "reader@example.com" }));

    const res = await GET();

    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock).toHaveBeenCalledWith("/me");
    expect(await res.json()).toEqual({ id: "u1", email: "reader@example.com" });
  });
});

describe("PATCH /api/backend/me", () => {
  const patchMock = vi.mocked(proxyPatch);
  const send = (body: string) => PATCH(new Request("http://localhost/x", { method: "PATCH", headers: { "Content-Type": "application/json" }, body }));

  beforeEach(() => {
    patchMock.mockReset();
    patchMock.mockResolvedValue(Response.json({ first_name: "Maya" }));
  });

  it("passes the names on to the backend", async () => {
    await send('{"first_name":"Maya","last_name":"Rao"}');

    expect(patchMock).toHaveBeenCalledExactlyOnceWith("/me", { first_name: "Maya", last_name: "Rao" });
  });

  it("refuses a body that is not JSON, without asking the backend", async () => {
    const res = await send("not json");

    expect(res.status).toBe(400);
    expect(patchMock).not.toHaveBeenCalled();
  });
});
