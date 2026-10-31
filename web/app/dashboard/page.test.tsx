import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/backend", () => ({ backendGet: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));

import { auth } from "@/auth";
import { backendGet } from "@/lib/backend";
import DashboardHome, { metadata } from "./page";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const getMock = backendGet as unknown as ReturnType<typeof vi.fn>;
const doc = (id: string, status: string) => ({ id, filename: `${id}.pdf`, doc_type: "lease", status, ocr_confidence: null });

beforeEach(() => {
  authMock.mockReset();
  getMock.mockReset();
  authMock.mockResolvedValue({ user: { email: "reader@example.com" } });
  getMock.mockResolvedValue([]);
});

async function page() {
  return renderToStaticMarkup(await DashboardHome());
}

describe("the dashboard home", () => {
  it.each([
    ["nobody is signed in", null],
    ["the session has no user", {}],
    ["the email is blank", { user: { email: "" } }],
  ])("sends the visitor to the landing page, asking the backend for nothing, when %s", async (_name, session) => {
    authMock.mockResolvedValue(session);

    await expect(DashboardHome()).rejects.toThrow(/^NEXT_REDIRECT:\/$/);
    expect(getMock).not.toHaveBeenCalled();
  });

  it("is the Dashboard section, with one heading, in the top bar and the tab", async () => {
    const html = await page();

    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>Dashboard<\/h1>/);
    expect(html).toMatch(/aria-current="page"[^>]*>Dashboard</);
    expect(metadata.title).toBe("Dashboard");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("shows the counts of the person's documents", async () => {
    getMock.mockResolvedValue([doc("a", "ready"), doc("b", "ready"), doc("c", "failed")]);

    const html = await page();

    expect(html).toMatch(/Documents<\/span><span[^>]*>3</);
    expect(html).toMatch(/Ready to open<\/span><span[^>]*>2</);
    expect(html).toMatch(/Needs attention<\/span><span[^>]*>1</);
    expect(getMock).toHaveBeenCalledWith("reader@example.com", "/documents");
  });

  it("invites a new person to add a first document, and an existing one to add or open", async () => {
    expect(await page()).toContain("Add your first document");

    getMock.mockResolvedValue([doc("a", "ready")]);
    expect(await page()).toContain("Add or open documents");
  });

  it("still shows the page, with zeros, when the backend cannot be reached", async () => {
    getMock.mockResolvedValue(null);

    const html = await page();

    expect(html).toContain("Dashboard");
    expect(html).toMatch(/Documents<\/span><span[^>]*>0</);
  });
});
