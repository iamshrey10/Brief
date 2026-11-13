import { proxyDelete, proxyPatch } from "@/lib/proxy";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyDelete(`/shares/${encodeURIComponent(id)}`);
}

/** Gives someone who can view the dashboard more time, or less: hours from the list, or an end date. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ detail: "invalid request" }, { status: 400 });
  }
  return proxyPatch(`/shares/${encodeURIComponent(id)}`, body);
}
