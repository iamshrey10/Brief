import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/proxy", () => ({ proxyPost: vi.fn() }));

import { proxyPost } from "@/lib/proxy";
import { POST } from "./route";

const proxyMock = vi.mocked(proxyPost);

beforeEach(() => {
  proxyMock.mockReset();
  proxyMock.mockResolvedValue(Response.json({ ok: true }));
});

describe("POST /api/backend/documents/[id]/retry", () => {
  it("asks the backend to read that document again", async () => {
    await POST(new Request("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ id: "doc-1" }),
    });

    expect(proxyMock).toHaveBeenCalledWith("/documents/doc-1/retry");
  });

  it("encodes the id so it cannot change the path", async () => {
    await POST(new Request("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ id: "../me?x=1" }),
    });

    expect(proxyMock).toHaveBeenCalledWith("/documents/..%2Fme%3Fx%3D1/retry");
  });

  it("returns whatever the proxy returns", async () => {
    proxyMock.mockResolvedValue(Response.json({ detail: "x" }, { status: 409 }));

    const res = await POST(new Request("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ id: "d" }),
    });

    expect(res.status).toBe(409);
  });
});
