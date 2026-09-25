import { requireSession } from "@/lib/require-session";

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function GET() {
  const result = await requireSession();
  if ("error" in result) return result.error;

  const res = await fetch(`${backendUrl}/documents`, {
    headers: { Authorization: `Bearer ${result.token}` },
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function POST(request: Request) {
  const result = await requireSession();
  if ("error" in result) return result.error;

  const body = await request.json();

  const res = await fetch(`${backendUrl}/documents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${result.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
