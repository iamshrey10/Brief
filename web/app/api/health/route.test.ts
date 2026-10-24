import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rate-limit", () => ({ redisIsReachable: vi.fn() }));

import { redisIsReachable } from "@/lib/rate-limit";
import { GET } from "./route";

const reachable = vi.mocked(redisIsReachable);
beforeEach(() => reachable.mockReset());

describe("GET /api/health", () => {
  it("answers 200 and ready when Redis responds", async () => {
    reachable.mockResolvedValue(true);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ready: true, redis: "ok" });
  });

  it("answers 503 with fixed words when Redis does not respond", async () => {
    reachable.mockResolvedValue(false);
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ready: false, redis: "unreachable" });
  });

  it("is never cached", async () => {
    reachable.mockResolvedValue(true);
    expect((await GET()).headers.get("Cache-Control")).toBe("no-store");
  });
});
