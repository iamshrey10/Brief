import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/service-token", () => ({ mintServiceToken: vi.fn().mockResolvedValue("signed-token") }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));

import { auth } from "@/auth";
import ProfilePage, { metadata } from "./page";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;

const fetchMock = vi.fn();
const USAGE = {
  ask: { used: 5, limit: 100, left: 95 },
  read: { used: 1, limit: 30, left: 29 },
  analyze: { used: 2, limit: 60, left: 58 },
};

beforeEach(() => {
  authMock.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => USAGE });
  vi.stubGlobal("fetch", fetchMock);
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

  it("asks the API for today's usage with a token for that person, without caching", async () => {
    authMock.mockResolvedValue({ user: { email: "reader@example.com" } });

    await page();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/me\/usage$/);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { Authorization: "Bearer signed-token" }, cache: "no-store" });
  });

  it("shows today's limits from the answer", async () => {
    authMock.mockResolvedValue({ user: { email: "reader@example.com" } });

    const html = await page();

    expect(html).toContain("5 of 100 used");
    expect(html).toContain("95 left today");
  });

  it.each([
    ["the API refuses", { ok: false, json: async () => ({}) }],
    ["the reply is not the numbers expected", { ok: true, json: async () => ({ ask: 1 }) }],
  ])("says the numbers are not available when %s, and still shows the account", async (_name, reply) => {
    authMock.mockResolvedValue({ user: { email: "reader@example.com" } });
    fetchMock.mockResolvedValue(reply);

    const html = await page();

    expect(html).toContain("Your usage is not available right now");
    expect(html).toContain("reader@example.com");
  });

  it("says the numbers are not available when the API cannot be reached", async () => {
    authMock.mockResolvedValue({ user: { email: "reader@example.com" } });
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    expect(await page()).toContain("Your usage is not available right now");
  });

  it("asks the API for nothing when nobody is signed in", async () => {
    authMock.mockResolvedValue(null);

    await expect(ProfilePage()).rejects.toThrow("NEXT_REDIRECT");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
