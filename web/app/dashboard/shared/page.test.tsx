import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/backend", () => ({ backendGet: vi.fn() }));
vi.mock("@/components/shared-with-you", () => ({ SharedWithYou: ({ items }: { items: unknown[] }) => <p>shared with you: {items.length}</p> }));
vi.mock("@/components/sharing-panel", () => ({ SharingPanel: ({ initial }: { initial: unknown[] }) => <p>sharing panel: {initial.length}</p> }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));

import { auth } from "@/auth";
import { backendGet } from "@/lib/backend";
import SharedPage, { metadata } from "./page";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const getMock = backendGet as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  authMock.mockReset();
  getMock.mockReset();
  authMock.mockResolvedValue({ user: { email: "friend@example.com" } });
});

describe("the Shared page", () => {
  it("sends a visitor who is not signed in to the landing page, asking for nothing", async () => {
    authMock.mockResolvedValue(null);

    await expect(SharedPage()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(getMock).not.toHaveBeenCalled();
  });

  it("shows what was shared with the person beside who they have shared with, from one asking each", async () => {
    getMock.mockImplementation(async (_email: string, path: string) => (path === "/shared" ? [] : []));

    const html = renderToStaticMarkup(await SharedPage());

    expect(getMock).toHaveBeenCalledWith("friend@example.com", "/shared");
    expect(getMock).toHaveBeenCalledWith("friend@example.com", "/shares");
    expect(html).toContain("shared with you: 0");
    expect(html).toContain("sharing panel: 0");
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it("asks search engines not to index it", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
