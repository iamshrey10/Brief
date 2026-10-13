import { proxyGet } from "@/lib/proxy";

/** Where the signed-in person stands today against each daily limit. */
export async function GET() {
  return proxyGet("/me/usage");
}
