import { proxyPost } from "@/lib/proxy";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyPost(`/documents/${encodeURIComponent(id)}/retry`);
}
