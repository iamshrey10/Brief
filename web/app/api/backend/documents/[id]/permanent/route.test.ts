import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/proxy", () => ({ proxyDelete: vi.fn() }));

import { proxyDelete } from "@/lib/proxy";
import { DELETE } from "./route";

const proxyMock = vi.mocked(proxyDelete);
const call = (id: string) => DELETE(new Request("http://localhost/x", { method: "DELETE" }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  proxyMock.mockReset();
  proxyMock.mockResolvedValue(new Response(null, { status: 204 }));
});

describe("DELETE /api/backend/documents/[id]/permanent", () => {
  it("asks the backend to delete that document from the bin for good", async () => {
    await call("doc-1");

    expect(proxyMock).toHaveBeenCalledWith("/documents/doc-1/permanent");
  });

  it("encodes the id so it cannot change the path", async () => {
    await call("../me?x=1");

    expect(proxyMock).toHaveBeenCalledWith("/documents/..%2Fme%3Fx%3D1/permanent");
  });

  it("returns whatever the proxy returns", async () => {
    proxyMock.mockResolvedValue(Response.json({ detail: "x" }, { status: 502 }));

    expect((await call("doc-1")).status).toBe(502);
  });
});
