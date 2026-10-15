import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/proxy", () => ({ proxyPatch: vi.fn() }));

import { proxyPatch } from "@/lib/proxy";
import { PATCH } from "./route";

const patchMock = vi.mocked(proxyPatch);

beforeEach(() => {
  patchMock.mockReset();
});

const context = (id: string) => ({ params: Promise.resolve({ id }) });

describe("PATCH /api/backend/documents/[id]/confirm", () => {
  it("tells the backend the file has arrived, through the shared proxy and with no body", async () => {
    patchMock.mockResolvedValue(Response.json({ status: "processing" }));

    const res = await PATCH(new Request("http://localhost/x", { method: "PATCH" }), context("d1"));

    expect(patchMock).toHaveBeenCalledExactlyOnceWith("/documents/d1/confirm", undefined);
    expect(await res.json()).toEqual({ status: "processing" });
  });

  it("keeps a refusal from the backend as it is", async () => {
    patchMock.mockResolvedValue(Response.json({ detail: "not the kind of file" }, { status: 400 }));

    const res = await PATCH(new Request("http://localhost/x", { method: "PATCH" }), context("d1"));

    expect(res.status).toBe(400);
  });

  it("cannot be pointed at another path by a crafted id", async () => {
    patchMock.mockResolvedValue(Response.json({}));

    await PATCH(new Request("http://localhost/x", { method: "PATCH" }), context("d1/../../me"));

    expect(patchMock).toHaveBeenCalledWith("/documents/d1%2F..%2F..%2Fme/confirm", undefined);
  });
});
