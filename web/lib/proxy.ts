import { requireSession } from "@/lib/require-session";

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";

type Method = "GET" | "POST" | "PATCH" | "DELETE";

/**
 * Forwards a signed-in user's request to the backend and hands the browser the answer.
 *
 * The browser never talks to the backend directly. This checks the session and rate limit,
 * then calls the backend with a short-lived signed token. These calls can wait on a model, so it
 * also has to survive the backend being slow, unreachable, or answering with something that
 * is not JSON, and still return a clean JSON error instead of a crash. A 204, which has no body,
 * passes straight through, since that is how a delete says it worked.
 */
async function forward(method: Method, path: string, body?: unknown): Promise<Response> {
  const result = await requireSession();
  if ("error" in result) return result.error;

  const headers: Record<string, string> = { Authorization: `Bearer ${result.token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  try {
    const res = await fetch(`${backendUrl}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
    if (res.status === 204) return new Response(null, { status: 204 });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ detail: "could not reach the reading service" }, { status: 502 });
  }
}

export const proxyGet = (path: string) => forward("GET", path);
export const proxyPost = (path: string) => forward("POST", path);
export const proxyPatch = (path: string, body: unknown) => forward("PATCH", path, body);
export const proxyDelete = (path: string) => forward("DELETE", path);
