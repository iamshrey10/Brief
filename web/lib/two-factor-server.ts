import { mintServiceToken } from "@/lib/service-token";

export type BackendAnswer = { status: number; body: unknown; retryAfter: string | null };

/**
 * Calls the backend for a signed in person from the server and gives back the status and the body, because the
 * second step has to tell a wrong code from a locked account. A backend that cannot be reached answers 502.
 */
export async function callBackend(email: string, method: "GET" | "POST", path: string, body?: unknown): Promise<BackendAnswer> {
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";
  try {
    const res = await fetch(`${backendUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await mintServiceToken(email)}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
    const retryAfter = res.headers.get("Retry-After");
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    return { status: res.status, body: parsed, retryAfter: retryAfter && /^\d{1,6}$/.test(retryAfter) ? retryAfter : null };
  } catch {
    return { status: 502, body: null, retryAfter: null };
  }
}
