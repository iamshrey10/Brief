import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }));

import { auth } from "@/auth";
import Home from "./page";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  authMock.mockReset();
});

async function landing(session: unknown): Promise<string> {
  authMock.mockResolvedValue(session);
  return renderToStaticMarkup(await Home());
}

describe("the landing page", () => {
  it("says what Brief is", async () => {
    const html = await landing(null);

    expect(html).toContain("Every clause, explained.");
    expect(html).toContain("exactly where every answer comes from");
  });

  it("offers Sign in with Google, and no way into the dashboard, to someone who is not signed in", async () => {
    const html = await landing(null);

    expect(html).toContain("Sign in with Google");
    expect(html).not.toContain("Go to dashboard");
    expect(html).not.toContain("Sign out");
  });

  it("offers the dashboard and Sign out, and no sign in, to someone who is signed in", async () => {
    const html = await landing({ user: { email: "reader@example.com" } });

    expect(html).toContain("Go to dashboard");
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain("Sign out");
    expect(html).not.toContain("Sign in with Google");
  });

  it("treats a session with no user as not signed in", async () => {
    const html = await landing({});

    expect(html).toContain("Sign in with Google");
  });

  it("links to the privacy page, whether or not someone is signed in", async () => {
    expect(await landing(null)).toContain('href="/privacy"');
    expect(await landing({ user: { email: "reader@example.com" } })).toContain('href="/privacy"');
    expect(await landing(null)).toContain('href="/terms"');
  });
});
