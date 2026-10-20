import { describe, expect, it } from "vitest";

import { E2E_USER, e2eSignInEnabled } from "./e2e-auth";

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
