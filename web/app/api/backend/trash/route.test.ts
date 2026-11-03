import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/proxy", () => ({ proxyGet: vi.fn() }));

import { proxyGet } from "@/lib/proxy";
import { GET } from "./route";

const proxyMock = vi.mocked(proxyGet);

beforeEach(() => {
  proxyMock.mockReset();
  proxyMock.mockResolvedValue(Response.json([]));
});

describe("GET /api/backend/trash", () => {
  it("asks the backend for the person's bin, and nothing else", async () => {
    await GET();

    expect(proxyMock).toHaveBeenCalledExactlyOnceWith("/trash");
  });

  it("returns whatever the proxy returns", async () => {
    proxyMock.mockResolvedValue(Response.json({ detail: "x" }, { status: 401 }));

    expect((await GET()).status).toBe(401);
  });
});
