import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({
  counts: new Map<string, number>(),
  expires: [] as [string, number][],
  incr: vi.fn(),
  expire: vi.fn(),
}));

vi.mock("ioredis", () => ({
  default: class FakeRedis {
    incr = redis.incr;
    expire = redis.expire;
  },
}));

import { checkRateLimit } from "./rate-limit";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
  redis.counts.clear();
  redis.expires.length = 0;
  redis.incr.mockReset();
  redis.expire.mockReset();
  redis.incr.mockImplementation(async (key: string) => {
    const next = (redis.counts.get(key) ?? 0) + 1;
    redis.counts.set(key, next);
    return next;
  });
  redis.expire.mockImplementation(async (key: string, seconds: number) => {
    redis.expires.push([key, seconds]);
    return 1;
  });
});

afterEach(() => {
  vi.useRealTimers();
});

async function use(identifier: string, times: number): Promise<boolean[]> {
  const results: boolean[] = [];
  for (let i = 0; i < times; i++) results.push(await checkRateLimit(identifier));
  return results;
}

describe("checkRateLimit", () => {
  it("allows 30 requests a minute and refuses the 31st", async () => {
    const results = await use("a@b.c", 31);

    expect(results.slice(0, 30).every(Boolean)).toBe(true);
    expect(results[30]).toBe(false);
  });

  it("keeps refusing for the rest of the minute", async () => {
    const results = await use("a@b.c", 40);

    expect(results.slice(30).every((allowed) => allowed === false)).toBe(true);
  });

  it("counts each person separately", async () => {
    await use("busy@b.c", 31);

    expect(await checkRateLimit("quiet@b.c")).toBe(true);
  });

  it("starts a fresh count when the minute rolls over", async () => {
    await use("a@b.c", 31);
    expect(await checkRateLimit("a@b.c")).toBe(false);

    vi.setSystemTime(new Date("2026-10-10T12:01:00Z"));

    expect(await checkRateLimit("a@b.c")).toBe(true);
  });

  it("does not start a fresh count in the middle of a minute", async () => {
    await use("a@b.c", 31);

    vi.setSystemTime(new Date("2026-10-10T12:00:59Z"));

    expect(await checkRateLimit("a@b.c")).toBe(false);
  });

  it("keys each counter by person and minute, so counters from other minutes are separate", async () => {
    await checkRateLimit("a@b.c");
    vi.setSystemTime(new Date("2026-10-10T12:05:00Z"));
    await checkRateLimit("a@b.c");

    const keys = [...redis.counts.keys()];
    expect(new Set(keys).size).toBe(2);
    expect(keys.every((key) => key.startsWith("ratelimit:a@b.c:"))).toBe(true);
  });

  it("makes a counter expire after the minute, set once when it is created", async () => {
    await use("a@b.c", 5);

    expect(redis.expires).toHaveLength(1);
    expect(redis.expires[0][1]).toBe(60);
    expect(redis.expires[0][0]).toBe([...redis.counts.keys()][0]);
  });

  it("fails closed when Redis fails, rather than letting everything through", async () => {
    redis.incr.mockRejectedValue(new Error("redis is down"));

    await expect(checkRateLimit("a@b.c")).rejects.toThrow("redis is down");
  });
});
