import { proxyDelete, proxyPatch } from "@/lib/proxy";

/** Changes one reminder, or marks it done or not done. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ detail: "invalid request" }, { status: 400 });
  }
  return proxyPatch(`/me/reminders/${encodeURIComponent(id)}`, body);
}

/** Deletes one reminder. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyDelete(`/me/reminders/${encodeURIComponent(id)}`);
}
