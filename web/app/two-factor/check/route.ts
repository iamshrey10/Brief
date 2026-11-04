import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { callBackend } from "@/lib/two-factor-server";
import { CHECK_VALID_SECONDS, cookieOptions, DEVICE_COOKIE, safeNext, signTwoFactor, TWO_FACTOR_COOKIE } from "@/lib/two-factor-cookie";

/**
 * Decides, for a signed in person without a settled check, where they go next. Nobody turned it on: on to where they were going.
 * It is on and this browser was remembered: on. Otherwise they give a code. If the backend cannot be asked, they are not let
 * through: they are shown the code page with a note, and nothing is assumed.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const email = (await auth())?.user?.email;
  if (!email) return NextResponse.redirect(new URL("/", url));

  const jar = await cookies();
  const answer = await callBackend(email, "POST", "/me/2fa/check", { device_token: jar.get(DEVICE_COOKIE)?.value ?? null });
  const check = answer.body as { required?: unknown; trusted?: unknown } | null;
  if (answer.status !== 200 || typeof check?.required !== "boolean") {
    return NextResponse.redirect(new URL(`/two-factor/verify?next=${encodeURIComponent(next)}&problem=1`, url));
  }

  if (!check.required || check.trusted === true) {
    jar.set(TWO_FACTOR_COOKIE, await signTwoFactor(email, check.required ? "ok" : "off"), cookieOptions(CHECK_VALID_SECONDS));
    return NextResponse.redirect(new URL(next, url));
  }
  return NextResponse.redirect(new URL(`/two-factor/verify?next=${encodeURIComponent(next)}`, url));
}
