import { cookies } from "next/headers";

import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { callBackend } from "@/lib/two-factor-server";
import { CHECK_VALID_SECONDS, cookieOptions, signTwoFactor, TWO_FACTOR_COOKIE } from "@/lib/two-factor-cookie";

/** Turns two step verification on with the first code, and passes the recovery codes on, which are shown only once. This browser is settled, so turning it on does not lock the person out of the page they are on. */
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

  const answer = await callBackend(email, "POST", "/me/2fa/enable", { code: body.code });
  if (answer.status === 429) {
    return Response.json({ error: "locked" }, { status: 429, headers: answer.retryAfter ? { "Retry-After": answer.retryAfter } : {} });
  }
  if (answer.status === 400) return Response.json({ error: "wrong" }, { status: 400 });
  if (answer.status === 409) return Response.json({ error: "no setup" }, { status: 409 });
  const codes = (answer.body as { recovery_codes?: unknown } | null)?.recovery_codes;
  if (answer.status !== 200 || !Array.isArray(codes)) return Response.json({ error: "unavailable" }, { status: 502 });

  (await cookies()).set(TWO_FACTOR_COOKIE, await signTwoFactor(email, "ok"), cookieOptions(CHECK_VALID_SECONDS));
  return Response.json({ recoveryCodes: codes.filter((code): code is string => typeof code === "string") });
}
