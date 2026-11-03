import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/backend", () => ({ backendGet: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { auth } from "@/auth";
import { backendGet } from "@/lib/backend";
import BinPage, { metadata } from "./page";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const getMock = backendGet as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  authMock.mockReset();
  getMock.mockReset();
  authMock.mockResolvedValue({ user: { email: "reader@example.com" } });
  getMock.mockResolvedValue([]);
});

const page = async () => renderToStaticMarkup(await BinPage());

describe("the bin page", () => {
  it.each([
    ["nobody is signed in", null],
    ["the session has no user", {}],
    ["the email is blank", { user: { email: "" } }],
  ])("sends the visitor to the landing page, asking for nothing, when %s", async (_name, session) => {
    authMock.mockResolvedValue(session);

    await expect(BinPage()).rejects.toThrow(/^NEXT_REDIRECT:\/$/);
    expect(getMock).not.toHaveBeenCalled();
  });

  it("is the Bin section, with one heading, and says how long documents stay", async () => {
    const html = await page();

    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>Bin<\/h1>/);
    expect(html).toContain("stay here for 7 days");
    expect(html).toMatch(/aria-current="page"[^>]*>Bin</);
    expect(metadata.title).toBe("Bin");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("asks the backend for the person's bin and shows what is in it", async () => {
    getMock.mockResolvedValue([{ id: "d1", filename: "maple-lease.pdf", doc_type: "lease", deleted_at: new Date().toISOString(), days_left: 6 }]);

    const html = await page();

    expect(getMock).toHaveBeenCalledExactlyOnceWith("reader@example.com", "/trash");
    expect(html).toContain("maple-lease.pdf");
    expect(html).toContain("6 days left");
  });

  it("shows the empty bin, and still the page, when the backend cannot be reached", async () => {
    getMock.mockResolvedValue(null);

    const html = await page();

    expect(html).toContain("The bin is empty");
  });
});
