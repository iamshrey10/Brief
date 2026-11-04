import { jwtVerify, SignJWT } from "jose";

/** The cookie that says this browser has already been through the second step, or has nothing to go through. */
export const TWO_FACTOR_COOKIE = "brief_2fa";
/** The cookie that holds the secret of a browser the person chose to remember. Only a hash of it is kept on the server. */
export const DEVICE_COOKIE = "brief_device";

/** How long a passed check is believed before the backend is asked again. A remembered browser passes again without a code. */
export const CHECK_VALID_SECONDS = 12 * 60 * 60;
export const DEVICE_VALID_SECONDS = 30 * 24 * 60 * 60;

/** "off": no second step is needed for this person. "ok": it was needed and has been given, or this browser is remembered. */
export type TwoFactorState = "off" | "ok";

const DEV_SECRET = "dev-only-two-factor-cookie-secret";

function key(): Uint8Array {
  const configured = process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === "production" && (!configured || configured.length < 32)) {
    throw new Error("AUTH_SECRET is not set to a real secret");
  }
  return new TextEncoder().encode(configured || DEV_SECRET);
}

/** A signed value for the cookie. It names the person, so it can never be used by anyone else, and it expires. */
export async function signTwoFactor(email: string, state: TwoFactorState): Promise<string> {
  return new SignJWT({ st: state })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime(`${CHECK_VALID_SECONDS}s`)
    .sign(key());
}

/** Whether the cookie is genuine, unexpired, for this person, and says the check is settled. Anything else is no. */
export async function twoFactorSettled(value: string | undefined, email: string): Promise<boolean> {
  if (!value) return false;
  try {
    const { payload } = await jwtVerify(value, key(), { algorithms: ["HS256"], subject: email });
    return payload.st === "off" || payload.st === "ok";
  } catch {
    return false;
  }
}

/** Where to go once the check is done. Only a place inside the signed in part of the site, so a link cannot send anyone elsewhere. */
export function safeNext(next: string | null | undefined): string {
  if (typeof next !== "string" || !/^\/dashboard(?:[/?#][^\s\\]*)?$/.test(next) || next.startsWith("//")) return "/dashboard";
  return next;
}

/** The settings every one of these cookies has: unreadable by scripts, sent only to this site, and only over HTTPS in production. */
export function cookieOptions(maxAge: number) {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge };
}
