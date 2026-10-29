import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn(), signOut: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));

import { auth } from "@/auth";
import ProfilePage, { metadata } from "./page";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  authMock.mockReset();
});

async function page(): Promise<string> {
  return renderToStaticMarkup(await ProfilePage());
}

describe("the profile page", () => {
  it.each([
    ["nobody is signed in", null],
    ["the session has no user", {}],
    ["the email is blank", { user: { email: "" } }],
  ])("sends the visitor to the landing page when %s", async (_name, session) => {
    authMock.mockResolvedValue(session);

    await expect(ProfilePage()).rejects.toThrow(/^NEXT_REDIRECT:\/$/);
  });

  it("shows who is signed in, how, and a badge with the first letter of the address", async () => {
    authMock.mockResolvedValue({ user: { email: "reader@example.com" } });

    const html = await page();

    expect(html).toContain("reader@example.com");
    expect(html).toContain("Signed in with Google");
    expect(html).toMatch(/aria-hidden="true"[^>]*>R</);
  });

  it("has one heading, named Profile, and the Account section named by its own heading", async () => {
    authMock.mockResolvedValue({ user: { email: "reader@example.com" } });

    const html = await page();

    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>Profile<\/h1>/);
    expect(html).toContain('aria-labelledby="account-heading"');
  });

  it("marks Profile as the current section in the top bar", async () => {
    authMock.mockResolvedValue({ user: { email: "reader@example.com" } });

    expect(await page()).toMatch(/aria-current="page"[^>]*>Profile</);
  });

  it("is named Profile in the tab and asks search engines not to index it", () => {
    expect(metadata.title).toBe("Profile");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
