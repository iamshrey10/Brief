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

type Node = { type?: unknown; props?: { className?: string; children?: unknown } };

/** Every element in a rendered tree, so a test can find a part of the page without a browser. */
function elements(tree: unknown): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (typeof tree !== "object" || tree === null) return [];
  const node = tree as Node;
  return [node, ...elements(node.props?.children)];
}

describe("the dashboard heading on a phone", () => {
  async function header(): Promise<Node> {
    authMock.mockResolvedValue({ user: { email: "reader@example.com" } });
    const found = elements(await Dashboard()).find((node) => node.type === "header");
    if (!found) throw new Error("no header on the page");
    return found;
  }

  it("stacks the text above the sign out button on a narrow screen, and side by side on a wide one", async () => {
    const className = (await header()).props?.className ?? "";

    expect(className).toContain("flex-col");
    expect(className).toContain("sm:flex-row");
    expect(className).toContain("sm:justify-between");
  });

  it("does not squeeze the description beside the button on a narrow screen", async () => {
    const className = (await header()).props?.className ?? "";

    expect(className.split(" ")).not.toContain("justify-between");
  });
});
