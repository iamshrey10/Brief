import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/proxy", () => ({ proxyPatch: vi.fn(), proxyDelete: vi.fn() }));

import { proxyDelete, proxyPatch } from "@/lib/proxy";
import { DELETE, PATCH } from "./route";

const patchMock = vi.mocked(proxyPatch);
const deleteMock = vi.mocked(proxyDelete);

const context = (id: string) => ({ params: Promise.resolve({ id }) });
const patchRequest = (body: string) =>
  new Request("http://localhost/x", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
  });

beforeEach(() => {
  patchMock.mockReset();
  deleteMock.mockReset();
  patchMock.mockResolvedValue(Response.json({ ok: true }));
  deleteMock.mockResolvedValue(new Response(null, { status: 204 }));
});

describe("PATCH /api/backend/documents/[id]", () => {
  it("forwards the changes to that document", async () => {
    await PATCH(patchRequest('{"filename":"Lease 2026.pdf","doc_type":"lease"}'), context("doc-1"));

    expect(patchMock).toHaveBeenCalledWith("/documents/doc-1", {
      filename: "Lease 2026.pdf",
      doc_type: "lease",
    });
  });

  it("encodes the id so it cannot change the path", async () => {
    await PATCH(patchRequest("{}"), context("../me?x=1"));

    expect(patchMock).toHaveBeenCalledWith("/documents/..%2Fme%3Fx%3D1", {});
  });

  it("answers 400 and goes nowhere when the body is not JSON", async () => {
    const res = await PATCH(patchRequest("not json"), context("doc-1"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ detail: "invalid request" });
    expect(patchMock).not.toHaveBeenCalled();
  });

  it("returns whatever the proxy returns", async () => {
    patchMock.mockResolvedValue(Response.json({ detail: "x" }, { status: 422 }));

    expect((await PATCH(patchRequest("{}"), context("d"))).status).toBe(422);
  });
});

describe("DELETE /api/backend/documents/[id]", () => {
  it("asks the backend to delete that document", async () => {
    await DELETE(new Request("http://localhost/x", { method: "DELETE" }), context("doc-1"));

    expect(deleteMock).toHaveBeenCalledWith("/documents/doc-1");
  });

  it("encodes the id so it cannot change the path", async () => {
    await DELETE(new Request("http://localhost/x", { method: "DELETE" }), context("../me?x=1"));

    expect(deleteMock).toHaveBeenCalledWith("/documents/..%2Fme%3Fx%3D1");
  });

  it("returns whatever the proxy returns, including the empty 204 of a delete that worked", async () => {
    const res = await DELETE(new Request("http://localhost/x", { method: "DELETE" }), context("d"));

    expect(res.status).toBe(204);
  });
});
