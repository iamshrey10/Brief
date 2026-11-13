import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/backend", () => ({ backendGet: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

import { auth } from "@/auth";
import { backendGet } from "@/lib/backend";
import SharedDashboardPage, { metadata } from "./page";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const getMock = backendGet as unknown as ReturnType<typeof vi.fn>;
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  authMock.mockReset();
  getMock.mockReset();
  authMock.mockResolvedValue({ user: { email: "friend@example.com" } });
});

describe("the shared dashboard page", () => {
  it("sends a visitor who is not signed in to the landing page, asking for nothing", async () => {
    authMock.mockResolvedValue(null);

    await expect(SharedDashboardPage(params("s1"))).rejects.toThrow("NEXT_REDIRECT:/");
    expect(getMock).not.toHaveBeenCalled();
  });

  it("asks for that share by name, safely, and shows whose dashboard it is", async () => {
    getMock.mockResolvedValue({ owner_email: "owner@example.com", documents: [], insights: [], key_dates: [] });

    const html = renderToStaticMarkup(await SharedDashboardPage(params("a/b")));

    expect(getMock).toHaveBeenCalledExactlyOnceWith("friend@example.com", "/shared/a%2Fb/dashboard");
    expect(html).toContain("owner@example.com");
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it("is not found when the share is gone, was never theirs, or the backend cannot be reached", async () => {
    getMock.mockResolvedValue(null);

    await expect(SharedDashboardPage(params("s1"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("tells a person whose access was taken away so, plainly, with the owner's name and a way back", async () => {
    getMock.mockImplementation(async (_email: string, path: string) =>
      path.endsWith("/removed") ? { owner_email: "owner@example.com", owner_name: "Asha Rao" } : null,
    );

    const html = renderToStaticMarkup(await SharedDashboardPage(params("gone/1")));

    expect(getMock).toHaveBeenCalledWith("friend@example.com", "/shared/gone%2F1/removed");
    expect(html).toContain("Your access was removed");
    expect(html).toContain("Asha Rao");
    expect(html).toContain('href="/dashboard/shared"');
  });

  it("tells a person whose time ran out that it ended, not that it was taken away", async () => {
    getMock.mockImplementation(async (_email: string, path: string) =>
      path.endsWith("/removed") ? { owner_email: "owner@example.com", owner_name: "Asha Rao", reason: "expired", ended_at: "2026-11-10T10:00:00Z" } : null,
    );

    const html = renderToStaticMarkup(await SharedDashboardPage(params("s1")));

    expect(html).toContain("Your access has ended");
    expect(html).toContain("that time is over");
    expect(html).toContain("ask them to share it again");
    expect(html).not.toContain("Your access was removed");
    expect(html).not.toContain("has removed your access");
    expect(html).toContain('href="/dashboard/shared"');
  });

  it("uses the email when the owner has no name", async () => {
    getMock.mockImplementation(async (_email: string, path: string) => (path.endsWith("/removed") ? { owner_email: "owner@example.com", owner_name: null } : null));

    expect(renderToStaticMarkup(await SharedDashboardPage(params("s1")))).toContain("owner@example.com");
  });

  it("asks search engines not to index it", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
