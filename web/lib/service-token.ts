import { SignJWT } from "jose";

const secret = new TextEncoder().encode(
  process.env.SERVICE_JWT_SECRET ?? "dev-only-secret-change-me",
);

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
    .sign(secret);
}
