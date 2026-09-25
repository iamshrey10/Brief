import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { mintServiceToken } from "@/lib/service-token";

type SessionResult = { token: string } | { error: Response };

/**
 * Confirms a real signed in user is making this request and that they haven't
 * exceeded their rate limit, then mints the short lived token the backend expects.
 */
export async function requireSession(): Promise<SessionResult> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return { error: Response.json({ error: "not signed in" }, { status: 401 }) };
  }

  const allowed = await checkRateLimit(email);
  if (!allowed) {
    return { error: Response.json({ error: "too many requests" }, { status: 429 }) };
  }

  return { token: await mintServiceToken(email) };
}
