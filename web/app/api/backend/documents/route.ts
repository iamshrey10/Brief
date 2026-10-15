import { proxyGet, proxyPost } from "@/lib/proxy";

/** The signed-in person's documents. */
export async function GET() {
  return proxyGet("/documents");
}

/** Starts an upload: the backend answers with the document and where to send the file. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ detail: "invalid request" }, { status: 400 });
  }

  return proxyPost("/documents", body);
}
