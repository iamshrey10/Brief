import { SignJWT } from "jose";

const DEV_SECRET = "dev-only-secret-change-me";
const MIN_SECRET_LENGTH = 32;

/**
 * The shared secret, read each time a token is made rather than once at import, so a missing value
 * stops a real request in production but never stops a build or a development run. In production it
 * refuses the built-in value and anything under 32 characters, and the error names the setting but
 * never prints it.
 */
function signingKey(): Uint8Array {
  const configured = process.env.SERVICE_JWT_SECRET;
  if (process.env.NODE_ENV === "production") {
    if (!configured || configured === DEV_SECRET) {
      throw new Error("SERVICE_JWT_SECRET is not set to a real secret");
    }
    if (configured.length < MIN_SECRET_LENGTH) {
      throw new Error(`SERVICE_JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
    }
  }
  return new TextEncoder().encode(configured || DEV_SECRET);
}

/**
 * Mints a short lived token proving a request really came from a signed in user.
 * The browser never sees this, it's created server side, right before calling the
 * backend, from the session Auth.js already verified.
 */
export async function mintServiceToken(email: string): Promise<string> {
  return await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(signingKey());
}
