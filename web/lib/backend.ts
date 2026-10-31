import { mintServiceToken } from "@/lib/service-token";

/**
 * Asks the backend for something on behalf of a signed in person, from the server, and gives back what it said, or
 * null when it could not: the backend refused, could not be reached, or answered with something that is not JSON.
 * Used by pages that show several things at once, where one of them failing should leave a gap and not a broken page.
 * Always asks afresh, so a page never shows what was true a minute ago.
 */
export async function backendGet(email: string, path: string): Promise<unknown | null> {
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";
  try {
    const res = await fetch(`${backendUrl}${path}`, {
      headers: { Authorization: `Bearer ${await mintServiceToken(email)}` },
      cache: "no-store",
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
