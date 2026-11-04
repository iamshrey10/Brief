import { proxyGet } from "@/lib/proxy";

/** Whether two step verification is on, and how many recovery codes are unused. */
export async function GET() {
  return proxyGet("/me/2fa");
}
