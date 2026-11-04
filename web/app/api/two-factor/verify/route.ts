import { cookies } from "next/headers";

import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { callBackend } from "@/lib/two-factor-server";
import { CHECK_VALID_SECONDS, cookieOptions, DEVICE_COOKIE, DEVICE_VALID_SECONDS, signTwoFactor, TWO_FACTOR_COOKIE } from "@/lib/two-factor-cookie";

/**
 * Gives the backend the code the person typed. A right one settles the check for this browser, and can keep the browser
 * remembered for thirty days. The answer says only whether it worked, or why not in a word, never anything about the secret.
 */
export async function POST(request: Request) {
  const email = (await auth())?.user?.email;
  if (!email) return Response.json({ error: "not signed in" }, { status: 401 });
  if (!(await checkRateLimit(email))) return Response.json({ error: "too many requests" }, { status: 429 });

  let body: { code?: unknown; remember?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }
  if (typeof body.code !== "string" || body.code.trim().length === 0 || body.code.length > 32) {
    return Response.json({ error: "wrong" }, { status: 400 });
  }

  const answer = await callBackend(email, "POST", "/me/2fa/verify", { code: body.code, remember: body.remember === true });
  if (answer.status === 429) {
    return Response.json({ error: "locked" }, { status: 429, headers: answer.retryAfter ? { "Retry-After": answer.retryAfter } : {} });
  }
  if (answer.status === 400) return Response.json({ error: "wrong" }, { status: 400 });
  if (answer.status !== 200) return Response.json({ error: "unavailable" }, { status: 502 });

  const done = answer.body as { device_token?: unknown; used_recovery_code?: unknown } | null;
  const jar = await cookies();
  jar.set(TWO_FACTOR_COOKIE, await signTwoFactor(email, "ok"), cookieOptions(CHECK_VALID_SECONDS));
  if (typeof done?.device_token === "string") jar.set(DEVICE_COOKIE, done.device_token, cookieOptions(DEVICE_VALID_SECONDS));
  return Response.json({ ok: true, usedRecoveryCode: done?.used_recovery_code === true });
}
