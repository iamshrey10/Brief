import { requireSession } from "@/lib/require-session";

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireSession();
  if ("error" in result) return result.error;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ detail: "invalid request" }, { status: 400 });
  }

  // This call waits on an LLM, so unlike the other proxy routes it has to survive the
  // backend being slow or unreachable and still hand the browser a clean JSON error.
  try {
    const res = await fetch(`${backendUrl}/documents/${id}/ask`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${result.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      { detail: "could not reach the answering service" },
      { status: 502 },
    );
  }
}
