import { requireSession } from "@/lib/require-session";

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";

/**
 * Forwards a signed-in user's request to the backend and hands the browser the answer.
 *
 * The browser never talks to the backend directly. This checks the session and rate limit,
 * then calls the backend with a short-lived signed token. These calls can wait on a model, so it
 * also has to survive the backend being slow, unreachable, or answering with something that
 * is not JSON, and still return a clean JSON error instead of a crash.
 */
async function forward(method: "GET" | "POST", path: string): Promise<Response> {
  const result = await requireSession();
  if ("error" in result) return result.error;

  try {
    const res = await fetch(`${backendUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${result.token}` },
      cache: "no-store",
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ detail: "could not reach the reading service" }, { status: 502 });
  }
}

export const proxyGet = (path: string) => forward("GET", path);
export const proxyPost = (path: string) => forward("POST", path);
