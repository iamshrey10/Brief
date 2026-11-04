import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/auth-actions", () => ({ signInToJoin: vi.fn() }));
vi.mock("@/components/join-form", () => ({ JoinForm: ({ token }: { token: string }) => <div data-testid="join-form">{token}</div> }));

import { auth } from "@/auth";
import JoinPage, { metadata } from "./page";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const render = async () => renderToStaticMarkup(await JoinPage({ params: Promise.resolve({ token: "the-secret" }) }));

beforeEach(() => authMock.mockReset());

describe("the invitation page", () => {
  it("asks someone who is signed out to sign in first, and shows no code box", async () => {
    authMock.mockResolvedValue(null);

    const html = await render();

    expect(html).toContain("Sign in with Google to continue");
    expect(html).not.toContain("join-form");
  });

  it("shows the code box, with the secret, to someone who is signed in", async () => {
    authMock.mockResolvedValue({ user: { email: "friend@example.com" } });

    const html = await render();

    expect(html).toContain("friend@example.com");
    expect(html).toContain('data-testid="join-form">the-secret');
    expect(html).not.toContain("Sign in with Google");
  });

  it("says they can only look, and has one heading", async () => {
    authMock.mockResolvedValue(null);

    const html = await render();

    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("can look, but not change anything");
  });

  it("is kept out of search engines and never passes the address on to another site", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.referrer).toBe("no-referrer");
  });
});
