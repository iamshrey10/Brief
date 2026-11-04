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

  it("asks search engines not to index it", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
