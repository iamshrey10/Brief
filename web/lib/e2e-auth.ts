/**
 * A way to sign in for the browser tests, because Google blocks automated sign in. It exists only when
 * E2E_AUTH is exactly "true" and the server is not in production, and `next start` and every real host
 * run in production, so a leaked variable cannot switch it on there. The address belongs to a reserved
 * domain that no real person can own.
 */
export const E2E_USER = { id: "e2e-reader", name: "E2E Reader", email: "e2e-reader@example.invalid" };

export function e2eSignInEnabled(env: { E2E_AUTH?: string; NODE_ENV?: string }): boolean {
  return env.E2E_AUTH === "true" && env.NODE_ENV !== "production";
}

const RESERVED_ADDRESS = /^[A-Za-z0-9._+-]+@example\.invalid$/;

/**
 * The person the test sign in signs in as. With no address it is the default reader. A test may ask for
 * its own address on the reserved domain so that each test has its own rate limit counter and tests cannot
 * use each other's allowance. Anything else is refused, so this can never sign in as a real address.
 */
export function e2eUserFor(requested: unknown): typeof E2E_USER | null {
  if (requested === undefined) return E2E_USER;
  if (typeof requested !== "string" || !RESERVED_ADDRESS.test(requested)) return null;
  return { ...E2E_USER, email: requested };
}
