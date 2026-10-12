import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  default: vi.fn(() => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() })),
}));
vi.mock("next-auth/providers/google", () => ({ default: { id: "google" } }));

import { authConfig } from "./auth";

type Authorized = (arguments_: { auth: unknown }) => boolean;
const authorized = authConfig.callbacks.authorized as unknown as Authorized;

describe("the sign in rule for protected pages", () => {
  it("lets a signed in person through", () => {
    expect(authorized({ auth: { user: { email: "reader@example.com" } } })).toBe(true);
  });

  it.each([
    ["nobody", null],
    ["an empty session", {}],
    ["a session with no user", { user: null }],
    ["a user with no email", { user: {} }],
    ["a blank email", { user: { email: "" } }],
  ])("turns away %s", (_name, session) => {
    expect(authorized({ auth: session })).toBe(false);
  });

  it("sends a visitor who is not signed in to the landing page, where the sign in button is", () => {
    expect(authConfig.pages.signIn).toBe("/");
  });

  it("signs in with Google", () => {
    expect(authConfig.providers).toHaveLength(1);
  });
});
