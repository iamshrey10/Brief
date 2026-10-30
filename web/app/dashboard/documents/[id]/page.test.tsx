import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/service-token", () => ({ mintServiceToken: vi.fn().mockResolvedValue("signed-token") }));
vi.mock("@/components/document-workspace", () => ({
  DocumentWorkspace: ({ documentId, clauses }: { documentId: string; clauses: unknown[] }) => (
    <div data-workspace={documentId}>{clauses.length} clauses</div>
  ),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  notFound: vi.fn(() => {
    throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_NOT_FOUND" });
  }),
}));

import { auth } from "@/auth";
import DocumentPage, { metadata } from "./page";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const fetchMock = vi.fn();

const document = (overrides: Record<string, unknown> = {}) => ({
  id: "doc-1",
  filename: "lease.pdf",
  doc_type: "lease",
  status: "ready",
  ocr_confidence: null,
  ...overrides,
});
const CLAUSES = [
  { id: "c1", clause_index: 0, page_number: 1, text: "Rent is due on the first." },
  { id: "c2", clause_index: 1, page_number: 1, text: "A deposit is refundable." },
];
const json = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/** Serves the document, and its clauses when asked for them. */
function serve(doc: ReturnType<typeof document>, clauses: unknown[] = CLAUSES) {
  fetchMock.mockImplementation(async (url: string) =>
    url.endsWith("/clauses") ? json(clauses) : json(doc),
  );
}

async function page(id = "doc-1"): Promise<string> {
  return renderToStaticMarkup(await DocumentPage({ params: Promise.resolve({ id }) }));
}

beforeEach(() => {
  authMock.mockReset();
  fetchMock.mockReset();
  authMock.mockResolvedValue({ user: { email: "reader@example.com" } });
  vi.stubGlobal("fetch", fetchMock);
});

describe("the document page", () => {
  it("sends someone who is not signed in to the landing page without asking the API for anything", async () => {
    authMock.mockResolvedValue(null);

    await expect(page()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks the API with a signed token and without caching, for the document and then its clauses", async () => {
    serve(document());

    await page();

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "http://localhost:8000/documents/doc-1",
      "http://localhost:8000/documents/doc-1/clauses",
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.headers).toEqual({ Authorization: "Bearer signed-token" });
      expect(init.cache).toBe("no-store");
    }
  });

  it("shows the name, the kind and the workspace with its clauses for a document that is ready", async () => {
    serve(document());

    const html = await page();

    expect(html).toContain("lease.pdf");
    expect(html).toContain("Lease");
    expect(html).toContain('data-workspace="doc-1"');
    expect(html).toContain("2 clauses");
    expect(html).toContain("Back to your documents");
  });

  it("is a not found page when the API says there is no such document", async () => {
    fetchMock.mockResolvedValue(json({ detail: "not found" }, 404));

    await expect(page("doc-x")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("says it could not load the document, and shows nothing else, when the API fails", async () => {
    fetchMock.mockResolvedValue(json({ detail: "the database is unavailable" }, 500));

    const html = await page();

    expect(html).toContain("We couldn&#x27;t load this document");
    expect(html).not.toContain("the database is unavailable");
    expect(html).not.toContain("data-workspace");
  });

  it("says it could not load the document when the API cannot be reached at all", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    const html = await page();

    expect(html).toContain("We couldn&#x27;t load this document");
  });

  it("explains a failed read and does not ask for clauses or show the workspace", async () => {
    serve(document({ status: "failed" }));

    const html = await page();

    expect(html).toContain("We couldn&#x27;t read this document");
    expect(html).not.toContain("data-workspace");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("says a document is still being read and shows no workspace", async () => {
    serve(document({ status: "processing" }));

    const html = await page();

    expect(html).toContain("Still processing");
    expect(html).not.toContain("data-workspace");
  });

  it("warns about a hard to read scan with its confidence, and still shows the workspace", async () => {
    serve(document({ status: "needs_retake", ocr_confidence: 41.4 }));

    const html = await page();

    expect(html).toContain("hard-to-read scan");
    expect(html).toContain("reading confidence 41%");
    expect(html).toContain("data-workspace");
  });

  it("does not make up a confidence for a hard to read scan that has none", async () => {
    serve(document({ status: "needs_retake", ocr_confidence: null }));

    expect((await page())).not.toContain("reading confidence");
  });

  it("says no readable text was found when a ready document has no clauses", async () => {
    serve(document(), []);

    const html = await page();

    expect(html).toContain("No readable text found");
    expect(html).not.toContain("data-workspace");
  });
});

describe("the facts under the document's name", () => {
  it("say how many clauses and pages it was read into", async () => {
    serve(document());

    const html = await page();

    expect(html).toContain('aria-label="About this document"');
    expect(html).toMatch(/>2<\/span> clauses/);
    expect(html).toMatch(/>1<\/span> page</);
  });

  it("are left out for a document still being read, which has no clauses yet", async () => {
    serve(document({ status: "processing" }));

    expect(await page()).not.toContain("About this document");
  });
});

describe("the document page top bar", () => {
  it("shows the signed in bar, with who is signed in and Sign out, above the document", async () => {
    serve(document());

    const html = await page();

    expect(html).toContain("reader@example.com");
    expect(html).toContain("Sign out");
    expect(html.indexOf("Sign out")).toBeLessThan(html.indexOf("lease.pdf"));
  });

  it("still shows the bar when the document could not be loaded, so the reader can leave or sign out", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    const html = await page();

    expect(html).toContain("We couldn&#x27;t load this document");
    expect(html).toContain("Sign out");
  });

  it("shows the kind of document as a label beside its name, and keeps a long name from pushing the page wide", async () => {
    serve(document({ filename: "a-very-long-file-name-that-goes-on.pdf", doc_type: "offer" }));

    const html = await page();

    expect(html).toMatch(/<span class="rounded-full[^"]*">Job offer<\/span>/);
    expect(html).toMatch(/<h1 class="[^"]*break-all/);
  });
});

describe("the document page tab title", () => {
  it("does not put the file name, which is private, into the title", () => {
    expect(metadata.title).toBe("Document");
  });

  it("asks search engines not to index it", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
