import { proxyPost } from "@/lib/proxy";

/** Says that Brief is open and being used, so the admin page can show how long people stay. Nothing is sent but the signal. */
export async function POST() {
  return proxyPost("/me/activity");
}
