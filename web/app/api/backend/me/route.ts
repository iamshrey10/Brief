import { proxyDelete } from "@/lib/proxy";
import { requireSession } from "@/lib/require-session";

export async function GET() {
  const result = await requireSession();
  if ("error" in result) return result.error;

  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";

  const res = await fetch(`${backendUrl}/me`, {
    headers: { Authorization: `Bearer ${result.token}` },
  });
  const data = await res.json();

  return Response.json(data, { status: res.status });
}

/** Deletes the signed-in account and every document in it. */
export async function DELETE() {
  return proxyDelete("/me");
}
