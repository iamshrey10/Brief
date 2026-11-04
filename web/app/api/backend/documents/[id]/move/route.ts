import { proxyPost } from "@/lib/proxy";

/** Moves a document's file to another folder. The API checks the folder is one of the five and that the document is the person's own. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ detail: "invalid request" }, { status: 400 });
  }

  return proxyPost(`/documents/${encodeURIComponent(id)}/move`, body);
}
