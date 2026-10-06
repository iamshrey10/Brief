import { proxyDelete, proxyPatch } from "@/lib/proxy";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ detail: "invalid request" }, { status: 400 });
  }

  return proxyPatch(`/documents/${encodeURIComponent(id)}`, body);
}

export async function DELETE(_request: Request, { params }: Context) {
  const { id } = await params;
  return proxyDelete(`/documents/${encodeURIComponent(id)}`);
}
