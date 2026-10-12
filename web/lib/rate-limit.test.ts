import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({
  counts: new Map<string, number>(),
  expires: [] as [string, number][],
  incr: vi.fn(),
  expire: vi.fn(),
  on: vi.fn(),
  created: [] as (string | undefined)[],
}));

vi.mock("ioredis", () => ({
  default: class FakeRedis {
    incr = redis.incr;
    expire = redis.expire;
    on = redis.on;
    constructor(url?: string) {
      redis.created.push(url);
    }
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

describe("the Redis connection", () => {
  /** A fresh copy of the module, as if the server had just started, with nothing recorded yet. */
  async function freshLimiter() {
    vi.resetModules();
    redis.created.length = 0;
    redis.on.mockClear();
    return (await import("./rate-limit")).checkRateLimit;
  }

  it("is not opened just by loading the file, so a build or a test never reaches for Redis", async () => {
    await freshLimiter();

    expect(redis.created).toEqual([]);
  });

  it("is opened once, on first use, and reused for every later request", async () => {
    const check = await freshLimiter();

    await check("a@b.c");
    await check("someone@else.c");
    await check("a@b.c");

    expect(redis.created).toHaveLength(1);
  });

  it("is opened with the address from the environment", async () => {
    vi.stubEnv("REDIS_URL", "redis://cache.internal:6380");
    const check = await freshLimiter();

    await check("a@b.c");

    expect(redis.created).toEqual(["redis://cache.internal:6380"]);
    vi.unstubAllEnvs();
  });

  it("listens for connection errors, so a Redis outage is logged instead of crashing the process", async () => {
    const check = await freshLimiter();

    await check("a@b.c");

    expect(redis.on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("never logs who was being checked when Redis cannot be reached", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const check = await freshLimiter();
    await check("private-person@example.com");
    const handler = redis.on.mock.calls.find(([event]) => event === "error")?.[1] as (e: Error) => void;

    handler(new Error("connect ECONNREFUSED for private-person@example.com"));

    expect(logged).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logged.mock.calls)).not.toContain("private-person");
    logged.mockRestore();
  });
});
