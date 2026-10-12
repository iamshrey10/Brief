import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/service-token", () => ({ mintServiceToken: vi.fn().mockResolvedValue("token") }));
vi.mock("@/components/document-upload", () => ({ DocumentUpload: () => null }));
vi.mock("@/components/delete-account", () => ({ DeleteAccount: () => null }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));

import { auth } from "@/auth";
import Dashboard from "./page";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const fetchMock = vi.fn();

beforeEach(() => {
  authMock.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
  vi.stubGlobal("fetch", fetchMock);
});

describe("the dashboard page", () => {
  it.each([
    ["nobody is signed in", null],
    ["the session has no user", {}],
    ["the user has no email", { user: {} }],
    ["the email is blank", { user: { email: "" } }],
  ])("sends the visitor to the landing page when %s, without asking the API for anything", async (_name, session) => {
    authMock.mockResolvedValue(session);

    await expect(Dashboard()).rejects.toThrow(/^NEXT_REDIRECT:\/$/); // exactly the landing page
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the page to a signed in person", async () => {
    authMock.mockResolvedValue({ user: { email: "reader@example.com" } });

    await expect(Dashboard()).resolves.toBeTruthy();
  });

  it("asks the API for that person's documents, with a token for them", async () => {
    authMock.mockResolvedValue({ user: { email: "reader@example.com" } });

    await Dashboard();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer token");
  });
});
