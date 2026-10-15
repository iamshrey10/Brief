import { proxyPost } from "@/lib/proxy";

/**
 * Asks a question about one document. The shared proxy checks the session, survives a slow or
 * unreachable backend with a clean JSON error, and tags the request so it can be found in the logs.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ detail: "invalid request" }, { status: 400 });
  }

  return proxyPost(`/documents/${encodeURIComponent(id)}/ask`, body);
}
