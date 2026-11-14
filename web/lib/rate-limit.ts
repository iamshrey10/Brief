import Redis from "ioredis";

import { cleanRedisUrl, redisUrlProblem } from "@/lib/redis-url";
import { WINDOW_SECONDS } from "@/lib/retry-after";

let connection: Redis | undefined;

/**
 * The Redis connection, opened the first time a request needs it and reused after that. Opening it when
 * the file is loaded made `next build` and every test try to reach Redis. A connection error is logged
 * with a fixed message that names nobody, and does not stop the process.
 */
function redis(): Redis {
  if (!connection) {
    connection = new Redis(cleanRedisUrl(process.env.REDIS_URL), {
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
    });
    connection.on("error", (error) => {
      // A fixed word about the shape of the setting, never its value, so a wrong paste can be told from an outage.
      const problem = redisUrlProblem(process.env.REDIS_URL);
      console.error(
        `rate limiter: could not reach Redis (${describeRedisError(error)})${problem ? `; the REDIS_URL setting ${problem}` : ""}`,
      );
    });
  }
  return connection;
}

/**
 * What went wrong, as a short fixed word and never the message itself: a connection error can quote the
 * address, and the address holds the password. `ECONNREFUSED`, `ENOTFOUND`, `ETIMEDOUT` and the like come
 * from the system, and `WRONGPASS` or `NOPERM` from the server.
 */
export function describeRedisError(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && /^[A-Z_]{3,40}$/.test(code)) return code;
  const message = error instanceof Error ? error.message : "";
  const word = /^(WRONGPASS|NOAUTH|NOPERM|ERR)\b/.exec(message);
  if (word) return word[1];
  if (
    message.startsWith("Command timed out") ||
    message.startsWith("Connection is closed")
  )
    return "TIMEOUT";
  if (error instanceof Error && /^[A-Za-z]{3,40}$/.test(error.name))
    return error.name;
  return "unknown";
}

/** How long a request waits for Redis before going on without the count. */
const REDIS_WAIT_MS = 1500;

function withinTime<T>(work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Command timed out")),
      REDIS_WAIT_MS,
    );
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const LIMIT_PER_WINDOW = 30;

/**
 * A simple fixed window counter per user, kept in Redis so it's shared across every
 * server instance instead of living in memory on just one machine.
 */
async function count(identifier: string): Promise<number> {
  const window = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
  const key = `ratelimit:${identifier}:${window}`;

  const used = await withinTime(redis().incr(key));
  if (used === 1) {
    await withinTime(redis().expire(key, WINDOW_SECONDS));
  }
  return used;
}

/**
 * Whether this person may make another request this minute.
 *
 * If Redis cannot be reached, an ordinary request goes through and a short line says why: this counter is
 * only a guard against a flood, and the backend still checks who is signed in and keeps its own daily
 * limits, so a Redis outage should not take the whole site down. Pass `strict` where the counter is the
 * protection itself (guessing two-factor codes): there a failure is thrown and the request is refused.
 */
export async function checkRateLimit(
  identifier: string,
  options: { strict?: boolean } = {},
): Promise<boolean> {
  try {
    return (await count(identifier)) <= LIMIT_PER_WINDOW;
  } catch (error) {
    if (options.strict) throw error;
    console.error(`rate limiter skipped (${describeRedisError(error)})`);
    return true;
  }
}

/** Whether Redis answers, for the readiness check. Never throws: a failure is just "no". */
export async function redisIsReachable(): Promise<boolean> {
  try {
    return (await redis().ping()) === "PONG";
  } catch {
    return false;
  }
}
