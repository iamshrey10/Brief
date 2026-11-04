import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { TWO_FACTOR_COOKIE, twoFactorSettled } from "@/lib/two-factor-cookie";

/**
 * Stands in front of everything signed in. Someone who is not signed in goes to the landing page. Someone who is must also have
 * been through the second step, if they have turned it on: a signed cookie says so. Without it they are sent to the check, which
 * asks the backend whether a code is needed and, if so, whether this browser is one they chose to remember.
 */
export const proxy = auth(async (request) => {
  const email = request.auth?.user?.email;
  if (!email) return NextResponse.redirect(new URL("/", request.nextUrl));
  if (await twoFactorSettled(request.cookies.get(TWO_FACTOR_COOKIE)?.value, email)) return NextResponse.next();

  const here = request.nextUrl.pathname + request.nextUrl.search;
  return NextResponse.redirect(new URL(`/two-factor/check?next=${encodeURIComponent(here)}`, request.nextUrl));
});

export const config = {
  matcher: ["/dashboard/:path*"],
};
