import { describe, expect, it } from "vitest";

import { E2E_USER, e2eSignInEnabled, e2eUserFor } from "./e2e-auth";

describe("e2eSignInEnabled", () => {
  it("is on only when it was asked for and this is not production", () => {
    expect(e2eSignInEnabled({ E2E_AUTH: "true", NODE_ENV: "development" })).toBe(true);
    expect(e2eSignInEnabled({ E2E_AUTH: "true", NODE_ENV: "test" })).toBe(true);
  });

  it("is never on in production, even when it was asked for", () => {
    expect(e2eSignInEnabled({ E2E_AUTH: "true", NODE_ENV: "production" })).toBe(false);
  });

  it.each([undefined, "", "false", "1", "yes", "TRUE", " true", "true "])(
    "is off for E2E_AUTH=%j, because only the exact word true turns it on",
    (value) => {
      expect(e2eSignInEnabled({ E2E_AUTH: value, NODE_ENV: "development" })).toBe(false);
    },
  );

  it("is off when nothing is set", () => {
    expect(e2eSignInEnabled({})).toBe(false);
  });

  it("signs in as an address no real person can have", () => {
    expect(E2E_USER.email.endsWith("@example.invalid")).toBe(true);
  });
});

describe("e2eUserFor", () => {
  it("signs in as the default test reader when no address is given", () => {
    expect(e2eUserFor(undefined)).toEqual(E2E_USER);
  });

  it("signs in as any address on the reserved domain, so each test can have its own rate limit", () => {
    expect(e2eUserFor("reader-1@example.invalid")).toMatchObject({ email: "reader-1@example.invalid" });
    expect(e2eUserFor("reader-2@example.invalid")?.email).not.toBe(e2eUserFor("reader-1@example.invalid")?.email);
  });

  it.each([
    "someone@gmail.com",
    "reader@example.invalid.evil.com",
    "reader@EXAMPLE.INVALID.com",
    "@example.invalid",
    "reader@example.invalid ",
    "a b@example.invalid",
    "reader@@example.invalid",
    "",
    "   ",
  ])("refuses %j, so the test sign in can never be used as a real person's address", (email) => {
    expect(e2eUserFor(email)).toBeNull();
  });

  it("refuses a value that is not text", () => {
    expect(e2eUserFor(42)).toBeNull();
    expect(e2eUserFor({ email: "reader@example.invalid" })).toBeNull();
  });
});
