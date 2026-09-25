import { requireSession } from "@/lib/require-session";

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireSession();
  if ("error" in result) return result.error;

  const { id } = await params;

  const res = await fetch(`${backendUrl}/documents/${id}/confirm`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${result.token}` },
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
