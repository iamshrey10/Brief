import { proxyPost } from "@/lib/proxy";

/** Starts setting up two step verification: a new secret and the address for the QR code. */
export async function POST() {
  return proxyPost("/me/2fa/setup");
}
