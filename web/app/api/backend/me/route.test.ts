import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/proxy", () => ({ proxyDelete: vi.fn() }));
vi.mock("@/lib/require-session", () => ({ requireSession: vi.fn() }));

import { proxyDelete } from "@/lib/proxy";
import { DELETE } from "./route";

const proxyMock = vi.mocked(proxyDelete);

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
