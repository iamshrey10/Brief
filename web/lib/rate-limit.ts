import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

const LIMIT_PER_WINDOW = 30;
const WINDOW_SECONDS = 60;

/**
 * A simple fixed window counter per user, kept in Redis so it's shared across every
 * server instance instead of living in memory on just one machine.
 */
export async function checkRateLimit(identifier: string): Promise<boolean> {
  const window = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
  const key = `ratelimit:${identifier}:${window}`;

  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, WINDOW_SECONDS);
  }

  return count <= LIMIT_PER_WINDOW;
}
