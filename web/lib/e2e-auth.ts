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
