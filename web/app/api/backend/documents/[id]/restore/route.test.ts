import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/proxy", () => ({ proxyPost: vi.fn() }));

import { proxyPost } from "@/lib/proxy";
import { POST } from "./route";

const proxyMock = vi.mocked(proxyPost);
const call = (id: string) => POST(new Request("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  proxyMock.mockReset();
  proxyMock.mockResolvedValue(Response.json({ ok: true }));
});

describe("POST /api/backend/documents/[id]/restore", () => {
  it("asks the backend to bring that document back from the bin", async () => {
    await call("doc-1");

    expect(proxyMock).toHaveBeenCalledWith("/documents/doc-1/restore");
  });

  it("encodes the id so it cannot change the path", async () => {
    await call("../me?x=1");

    expect(proxyMock).toHaveBeenCalledWith("/documents/..%2Fme%3Fx%3D1/restore");
  });

  it("returns whatever the proxy returns, including a refusal", async () => {
    proxyMock.mockResolvedValue(Response.json({ detail: "limit" }, { status: 409 }));

    const res = await call("doc-1");

    expect(res.status).toBe(409);
  });
});
