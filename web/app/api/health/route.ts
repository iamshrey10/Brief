import { redisIsReachable } from "@/lib/rate-limit";

/**
 * For a host's health check. The website cannot serve a signed in person without Redis (every call is rate
 * limited there), so this answers 200 only when Redis responds and 503 otherwise, with fixed words and no detail.
 */
export async function GET() {
  const redis = (await redisIsReachable()) ? "ok" : "unreachable";
  const ready = redis === "ok";
  return Response.json({ ready, redis }, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
