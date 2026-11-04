import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/proxy", () => ({ proxyPost: vi.fn() }));

import { proxyPost } from "@/lib/proxy";
import { POST } from "./route";

const proxyMock = vi.mocked(proxyPost);
const call = (id: string, body: string) =>
  POST(new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json" }, body }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  proxyMock.mockReset();
  proxyMock.mockResolvedValue(Response.json({ ok: true }));
});

describe("POST /api/backend/documents/[id]/move", () => {
  it("passes the folder on to that document, naming it safely", async () => {
    await call("a/b", '{"folder":"Lease"}');

    expect(proxyMock).toHaveBeenCalledExactlyOnceWith("/documents/a%2Fb/move", { folder: "Lease" });
  });

  it("refuses a body that is not JSON without asking the backend", async () => {
    const res = await call("doc-1", "nope");

    expect(res.status).toBe(400);
    expect(proxyMock).not.toHaveBeenCalled();
  });
});
