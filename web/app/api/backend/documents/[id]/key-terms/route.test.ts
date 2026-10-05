import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/proxy", () => ({ proxyGet: vi.fn() }));

import { proxyGet } from "@/lib/proxy";
import { GET } from "./route";

const proxyMock = vi.mocked(proxyGet);

beforeEach(() => {
  proxyMock.mockReset();
  proxyMock.mockResolvedValue(Response.json({ ok: true }));
});

describe("GET /api/backend/documents/[id]/key-terms", () => {
  it("forwards to the backend's key-terms endpoint for that document", async () => {
    await GET(new Request("http://localhost/x"), { params: Promise.resolve({ id: "doc-1" }) });

    expect(proxyMock).toHaveBeenCalledWith("/documents/doc-1/key-terms");
  });

  it("encodes the id so it cannot change the path", async () => {
    await GET(new Request("http://localhost/x"), { params: Promise.resolve({ id: "../me?x=1" }) });

    expect(proxyMock).toHaveBeenCalledWith("/documents/..%2Fme%3Fx%3D1/key-terms");
  });

  it("returns whatever the proxy returns", async () => {
    proxyMock.mockResolvedValue(Response.json({ detail: "x" }, { status: 409 }));

    const res = await GET(new Request("http://localhost/x"), { params: Promise.resolve({ id: "d" }) });

    expect(res.status).toBe(409);
  });
});
