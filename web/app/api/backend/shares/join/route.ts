import { proxyPost } from "@/lib/proxy";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ detail: "invalid request" }, { status: 400 });
  }
  return proxyPost("/shares/join", body);
}
