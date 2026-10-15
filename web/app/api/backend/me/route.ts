import { proxyDelete, proxyGet } from "@/lib/proxy";

/** Who is signed in. */
export async function GET() {
  return proxyGet("/me");
}

/** Deletes the signed-in account and every document in it. */
export async function DELETE() {
  return proxyDelete("/me");
}
