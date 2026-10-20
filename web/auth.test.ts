import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  default: vi.fn(() => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() })),
}));
vi.mock("next-auth/providers/google", () => ({
  default: (options: unknown) => ({ id: "google", options }),
}));
vi.mock("next-auth/providers/credentials", () => ({
  default: (options: { id: string; authorize: () => unknown }) => ({
    id: options.id,
    type: "credentials",
    authorize: options.authorize,
  }),
}));

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

  it("always shows Google's account chooser, so one tap never signs in as whoever Google remembers", () => {
    expect(authConfig.providers[0]).toEqual({
      id: "google",
      options: { authorization: { params: { prompt: "select_account" } } },
    });
  });

  it("signs in with Google", () => {
    expect(authConfig.providers).toHaveLength(1);
  });
});

describe("the test only sign in", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function providersWith(env: Record<string, string>) {
    vi.resetModules();
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    const { authConfig: fresh } = await import("./auth");
    return fresh.providers as unknown as { id: string; authorize?: () => unknown }[];
  }

  it("is not there by default, so a real run offers Google and nothing else", async () => {
    const providers = await providersWith({ NODE_ENV: "development" });

    expect(providers.map((provider) => provider.id)).toEqual(["google"]);
  });

  it("is added when it was asked for outside production, and signs in as the reserved test address", async () => {
    const providers = await providersWith({ E2E_AUTH: "true", NODE_ENV: "development" });

    expect(providers.map((provider) => provider.id)).toEqual(["google", "e2e"]);
    expect(await providers[1].authorize!()).toMatchObject({ email: "e2e-reader@example.invalid" });
  });

  it("is never added in production, even when it was asked for", async () => {
    const providers = await providersWith({ E2E_AUTH: "true", NODE_ENV: "production" });

    expect(providers.map((provider) => provider.id)).toEqual(["google"]);
  });
});
