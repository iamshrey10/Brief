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
  // One id per request, sent to the backend and handed back to the browser, so the same request can be
  // found in both sets of logs. A refusal gets one too.
  const requestId = crypto.randomUUID();
  const idHeader = { "X-Request-ID": requestId };

  const result = await requireSession();
  if ("error" in result) {
    result.error.headers.set("X-Request-ID", requestId);
    return result.error;
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${result.token}`, ...idHeader };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  try {
    const res = await fetch(`${backendUrl}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
    if (res.status === 204) return new Response(null, { status: 204, headers: idHeader });
    const data = await res.json();
    return Response.json(data, { status: res.status, headers: idHeader });
  } catch {
    return Response.json(
      { detail: "could not reach the reading service" },
      { status: 502, headers: idHeader },
    );
  }
}

export const proxyGet = (path: string) => forward("GET", path);
export const proxyPost = (path: string, body?: unknown) => forward("POST", path, body);
export const proxyPatch = (path: string, body: unknown) => forward("PATCH", path, body);
export const proxyDelete = (path: string) => forward("DELETE", path);
