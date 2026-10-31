import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/service-token", () => ({ mintServiceToken: vi.fn().mockResolvedValue("token") }));
vi.mock("@/components/document-upload", () => ({ DocumentUpload: () => null }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));

import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { ComingUp } from "@/components/coming-up";
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

  it("asks the API for that person's documents and for the dates already saved in them, each with a token for them", async () => {
    authMock.mockResolvedValue({ user: { email: "reader@example.com" } });

    await Dashboard();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map(([url]) => url as string).sort();
    expect(urls[0]).toMatch(/\/documents$/);
    expect(urls[1]).toMatch(/\/me\/key-dates$/);
    for (const call of fetchMock.mock.calls) expect(call[1].headers.Authorization).toBe("Bearer token");
  });
});

describe("the dashboard coming up strip", () => {
  const found = [
    { document_id: "d1", field: "lease_end", label: "Lease ends", value: "December 31, 2099" },
    { document_id: "d2", field: "lease_end", label: "Lease ends", value: "oops" },
  ];

  async function keyDatesPassedOn(reply: unknown, ok = true) {
    authMock.mockResolvedValue({ user: { email: "reader@example.com" } });
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/me/key-dates")
        ? { ok, json: async () => reply }
        : { ok: true, json: async () => [{ id: "d1", filename: "lease.pdf", doc_type: "lease" }] },
    );
    const strip = elements(await Dashboard()).find((node) => node.type === ComingUp) as
      | { props: { keyDates: unknown[]; documents: unknown[] } }
      | undefined;
    return strip?.props;
  }

  it("is given the dates and the documents they belong to", async () => {
    const props = await keyDatesPassedOn(found);

    expect(props?.keyDates).toHaveLength(2);
    expect(props?.documents).toEqual([{ id: "d1", filename: "lease.pdf", doc_type: "lease" }]);
  });

  it("drops an entry that is not shaped like a date, and anything that is not a list", async () => {
    expect((await keyDatesPassedOn([...found, null, { field: 3 }, "x"]))?.keyDates).toHaveLength(2);
    expect((await keyDatesPassedOn({ detail: "nope" }))?.keyDates).toEqual([]);
  });

  it("shows no countdown, and still shows the page, when the dates cannot be had", async () => {
    expect((await keyDatesPassedOn({}, false))?.keyDates).toEqual([]);
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/me/key-dates")) throw new TypeError("fetch failed");
      return { ok: true, json: async () => [] };
    });
    authMock.mockResolvedValue({ user: { email: "reader@example.com" } });

    await expect(Dashboard()).resolves.toBeTruthy();
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
    expect(renderToStaticMarkup(<AppHeader email="a@b.co" current="documents" />)).toContain("max-w-4xl");
  });

  it("no longer carries its own sign out or theme button beside the heading", async () => {
    const all = elements(await tree());

    expect(all.filter((node) => node.type === "form")).toHaveLength(0);
  });
});

describe("the dashboard documents summary", () => {
  async function html(documents: unknown[]): Promise<string> {
    authMock.mockResolvedValue({ user: { email: "reader@example.com" } });
    fetchMock.mockResolvedValue({ ok: true, json: async () => documents });
    return renderToStaticMarkup(await Dashboard());
  }

  it("says how many documents there are and how many of each kind", async () => {
    const page = await html([{ doc_type: "lease" }, { doc_type: "lease" }, { doc_type: "loan" }]);

    expect(page).toContain("3 documents");
    expect(page).toMatch(/Education loan <span[^>]*>1<\/span>/);
    expect(page).toMatch(/Lease <span[^>]*>2<\/span>/);
  });

  it("says there are none yet, with no kind badges, when the person has no documents", async () => {
    const page = await html([]);

    expect(page).toContain("No documents yet");
    expect(page).not.toContain("rounded-full");
  });

  it("shows no summary of someone else's data when the API fails, only that there are none", async () => {
    authMock.mockResolvedValue({ user: { email: "reader@example.com" } });
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ detail: "boom" }) });

    expect(renderToStaticMarkup(await Dashboard())).toContain("No documents yet");
  });
});

describe("the dashboard footer", () => {
  it("no longer holds account deletion, which lives in the Danger zone of the Profile page", async () => {
    authMock.mockResolvedValue({ user: { email: "reader@example.com" } });
    const footer = elements(await Dashboard()).find((node) => node.type === "footer");

    expect(elements(footer).some((node) => typeof node.type === "function" && node.type.name === "DeleteAccount")).toBe(false);
  });

  it("is set off from the documents by a rule above it", async () => {
    authMock.mockResolvedValue({ user: { email: "reader@example.com" } });
    const footer = elements(await Dashboard()).find((node) => node.type === "footer");

    expect(footer?.props?.className).toContain("border-t");
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
