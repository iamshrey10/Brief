import { proxyDelete, proxyGet, proxyPatch } from "@/lib/proxy";

/** Who is signed in. */
export async function GET() {
  return proxyGet("/me");
}

/** Deletes the signed-in account and every document in it. */
export async function DELETE() {
  return proxyDelete("/me");
}

/** Saves the signed-in person's first and last name. */
export async function PATCH(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ detail: "invalid request" }, { status: 400 });
  }
  return proxyPatch("/me", body);
}
