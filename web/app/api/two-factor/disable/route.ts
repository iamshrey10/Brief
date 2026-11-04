import { cookies } from "next/headers";

import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { callBackend } from "@/lib/two-factor-server";
import { CHECK_VALID_SECONDS, cookieOptions, DEVICE_COOKIE, signTwoFactor, TWO_FACTOR_COOKIE } from "@/lib/two-factor-cookie";

/** Turns two step verification off, which needs a right code. The remembered-browser cookie goes too, since the backend forgot it. */
export async function POST(request: Request) {
  const email = (await auth())?.user?.email;
  if (!email) return Response.json({ error: "not signed in" }, { status: 401 });
  if (!(await checkRateLimit(email))) return Response.json({ error: "too many requests" }, { status: 429 });

  let body: { code?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }
  if (typeof body.code !== "string" || body.code.trim().length === 0 || body.code.length > 32) {
    return Response.json({ error: "wrong" }, { status: 400 });
  }

  const answer = await callBackend(email, "POST", "/me/2fa/disable", { code: body.code });
  if (answer.status === 429) {
    return Response.json({ error: "locked" }, { status: 429, headers: answer.retryAfter ? { "Retry-After": answer.retryAfter } : {} });
  }
  if (answer.status === 400) return Response.json({ error: "wrong" }, { status: 400 });
  if (answer.status === 409) return Response.json({ error: "not on" }, { status: 409 });
  if (answer.status !== 200) return Response.json({ error: "unavailable" }, { status: 502 });

  const jar = await cookies();
  jar.set(TWO_FACTOR_COOKIE, await signTwoFactor(email, "off"), cookieOptions(CHECK_VALID_SECONDS));
  jar.delete(DEVICE_COOKIE);
  return Response.json({ ok: true });
}
