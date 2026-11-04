import { proxyDelete } from "@/lib/proxy";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyDelete(`/shares/${encodeURIComponent(id)}`);
}
