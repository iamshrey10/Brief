import { renderToStaticMarkup } from "react-dom/server";
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
import { AppHeader } from "@/components/app-header";
import Dashboard, { metadata } from "./page";

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

type Node = { type?: unknown; props?: { className?: string; children?: unknown } };

/** Every element in a rendered tree, so a test can find a part of the page without a browser. */
function elements(tree: unknown): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (typeof tree !== "object" || tree === null) return [];
  const node = tree as Node;
  return [node, ...elements(node.props?.children)];
}

describe("the dashboard top bar", () => {
  async function tree() {
    authMock.mockResolvedValue({ user: { email: "reader@example.com" } });
    return Dashboard();
  }

  it("is the shared signed in header, given the address of the person signed in", async () => {
    const header = elements(await tree()).find((node) => node.type === AppHeader) as
      | { props: { email: string } }
      | undefined;

    expect(header?.props.email).toBe("reader@example.com");
  });

  it("comes before the page's own content, so it is the first thing on the page", async () => {
    const all = elements(await tree());
    const bar = all.findIndex((node) => node.type === AppHeader);
    const title = all.findIndex((node) => node.type === "h1");

    expect(bar).toBeGreaterThanOrEqual(0);
    expect(bar).toBeLessThan(title);
  });

  it("is as wide as the content under it, so their edges line up", async () => {
    const all = elements(await tree());
    const content = all.find((node) => node.props?.className?.includes("max-w-4xl"));

    expect(content).toBeDefined();
    // The header's default width is the same one.
    expect(renderToStaticMarkup(<AppHeader email="a@b.co" />)).toContain("max-w-4xl");
  });

  it("no longer carries its own sign out or theme button beside the heading", async () => {
    const all = elements(await tree());

    expect(all.filter((node) => node.type === "form")).toHaveLength(0);
  });
});

describe("the dashboard tab title", () => {
  it("says what the page is, and the site name is added after it", () => {
    expect(metadata.title).toBe("Your contracts");
  });

  it("asks search engines not to index it", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
