import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/backend", () => ({ backendGet: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/components/app-header", () => ({ AppHeader: () => null }));

import { auth } from "@/auth";
import { backendGet } from "@/lib/backend";
import AdminPage, { metadata } from "./page";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const getMock = backendGet as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  authMock.mockReset();
  getMock.mockReset();
  authMock.mockResolvedValue({ user: { email: "owner@example.com" } });
});

describe("the admin page", () => {
  it("sends a visitor who is not signed in to the landing page, asking the backend for nothing", async () => {
    authMock.mockResolvedValue(null);

    await expect(AdminPage()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(getMock).not.toHaveBeenCalled();
  });

  it("is simply not found for anyone the backend does not let in", async () => {
    getMock.mockResolvedValue(null);

    await expect(AdminPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getMock).toHaveBeenCalledExactlyOnceWith("owner@example.com", "/admin/stats?days=30");
  });

  it("is not found when the answer is not the numbers", async () => {
    getMock.mockResolvedValue({ detail: "not found" });

    await expect(AdminPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("shows the numbers to the owner, under one heading, saying it is counts only", async () => {
    getMock.mockResolvedValue({ generated_at: "2026-11-12T22:00:00Z", people: { total: 12 } });

    const html = renderToStaticMarkup(await AdminPage());

    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("Admin");
    expect(html).toContain("counts only");
    expect(html).toContain("Signed up");
  });

  it.each([["7", 7], ["30", 30], ["90", 90], ["45", 30], ["abc", 30], [undefined, 30], [["7", "90"], 30]])("asks for the stretch in the address, %j, as %j days, and for 30 when it is not one of the three", async (asked, days) => {
    getMock.mockResolvedValue({ generated_at: "2026-11-12T22:00:00Z" });

    renderToStaticMarkup(await AdminPage({ searchParams: Promise.resolve({ days: asked as string | undefined }) }));

    expect(getMock).toHaveBeenCalledExactlyOnceWith("owner@example.com", `/admin/stats?days=${days}`);
  });

  it("asks search engines not to index it", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
