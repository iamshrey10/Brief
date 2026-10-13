import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/proxy", () => ({ proxyGet: vi.fn() }));

import { proxyGet } from "@/lib/proxy";
import { GET } from "./route";

const proxyMock = vi.mocked(proxyGet);

beforeEach(() => {
  proxyMock.mockReset();
  proxyMock.mockResolvedValue(Response.json({ ask: { used: 1, limit: 100, left: 99 } }));
});

describe("GET /api/backend/me/usage", () => {
  it("asks the backend where the signed-in person stands against their daily limits, and nothing else", async () => {
    await GET();

    expect(proxyMock).toHaveBeenCalledExactlyOnceWith("/me/usage");
  });

  it("returns whatever the proxy returns", async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ask: { used: 1, limit: 100, left: 99 } });
  });

  it("passes a failure through, such as being signed out", async () => {
    proxyMock.mockResolvedValue(Response.json({ error: "not signed in" }, { status: 401 }));

    expect((await GET()).status).toBe(401);
  });
});
