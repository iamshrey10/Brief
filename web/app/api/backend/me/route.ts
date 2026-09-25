import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { mintServiceToken } from "@/lib/service-token";

export async function GET() {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    return Response.json({ error: "not signed in" }, { status: 401 });
  }

  const allowed = await checkRateLimit(email);
  if (!allowed) {
    return Response.json({ error: "too many requests" }, { status: 429 });
  }

  const token = await mintServiceToken(email);
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";

  const res = await fetch(`${backendUrl}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();

  return Response.json(data, { status: res.status });
}
