import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/proxy", () => ({ proxyDelete: vi.fn(), proxyGet: vi.fn() }));
vi.mock("@/lib/require-session", () => ({ requireSession: vi.fn() }));

import { proxyDelete, proxyGet } from "@/lib/proxy";
import { DELETE, GET } from "./route";

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
