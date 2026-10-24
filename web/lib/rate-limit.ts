import Redis from "ioredis";

let connection: Redis | undefined;

/**
 * The Redis connection, opened the first time a request needs it and reused after that. Opening it when
 * the file is loaded made `next build` and every test try to reach Redis. A connection error is logged
 * with a fixed message that names nobody, and does not stop the process.
 */
function redis(): Redis {
  if (!connection) {
    connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
    connection.on("error", () => console.error("rate limiter: could not reach Redis"));
  }
  return connection;
}

const LIMIT_PER_WINDOW = 30;
const WINDOW_SECONDS = 60;

/**
 * A simple fixed window counter per user, kept in Redis so it's shared across every
 * server instance instead of living in memory on just one machine.
 */
export async function checkRateLimit(identifier: string): Promise<boolean> {
  const window = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
  const key = `ratelimit:${identifier}:${window}`;

  const count = await redis().incr(key);
  if (count === 1) {
    await redis().expire(key, WINDOW_SECONDS);
  }

  return count <= LIMIT_PER_WINDOW;
}

/** Whether Redis answers, for the readiness check. Never throws: a failure is just "no". */
export async function redisIsReachable(): Promise<boolean> {
  try {
    return (await redis().ping()) === "PONG";
  } catch {
    return false;
  }
}
