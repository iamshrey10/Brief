import { proxyPatch } from "@/lib/proxy";

/** Tells the backend the file has arrived in storage, so it can check it and start reading it. */
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyPatch(`/documents/${encodeURIComponent(id)}/confirm`, undefined);
}
