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

    expect(html).toMatch(/Documents<\/span>[\s\S]*?<span class="font-heading[^>]*>3</);
    expect(html).toMatch(/Ready to open<\/span>[\s\S]*?<span class="font-heading[^>]*>2</);
    expect(html).toMatch(/Needs attention<\/span>[\s\S]*?<span class="font-heading[^>]*>1</);
    expect(getMock).toHaveBeenCalledWith("reader@example.com", "/documents");
  });

  it("shows the way to add documents, as one button, whether or not there are documents", async () => {
    for (const documents of [[], [doc("a", "ready")]]) {
      getMock.mockResolvedValue(documents);
      const html = await page();

      expect(html).toContain('aria-label="Add documents"');
      expect(html).toContain("Add documents</button>");
      expect(html).not.toContain("Drop a contract here");
      expect(html.indexOf("Your documents at a glance")).toBeLessThan(html.indexOf('aria-label="Add documents"'));
    }
  });

  it("still shows the page, with zeros, when the backend cannot be reached", async () => {
    getMock.mockResolvedValue(null);

    const html = await page();

    expect(html).toContain("Dashboard");
    expect(html).toMatch(/Documents<\/span>[\s\S]*?<span class="font-heading[^>]*>0</);
  });

  it("asks for the documents and what is worked out about each, each once", async () => {
    await page();

    expect(getMock.mock.calls.map(([, path]) => path).sort()).toEqual(["/documents", "/me", "/me/insights", "/me/key-dates", "/shared"]);
  });

  it("shows how long the lease has left when a clear end date was found, and no card when none was", async () => {
    const end = new Date();
    end.setDate(end.getDate() + 30);
    const value = `${end.toLocaleString("en-US", { month: "long" })} ${end.getDate()}, ${end.getFullYear()}`;
    getMock.mockImplementation(async (_email: string, path: string) => {
      if (path === "/documents") return [doc("a", "ready")];
      if (path === "/me/key-dates") return [{ document_id: "a", field: "lease_end", label: "Lease ends", value }];
      return [];
    });

    const withLease = await page();
    expect(withLease).toContain('aria-label="Lease remaining"');
    expect(withLease).toContain("30 days left");

    getMock.mockResolvedValue([]);
    expect(await page()).not.toContain("Lease remaining");
  });

  it("asks someone who has not given their name for it first, and only when the backend clearly says so", async () => {
    getMock.mockImplementation(async (_email: string, path: string) => (path === "/me" ? { id: "u1", email: "a@x.com", first_name: null } : []));
    await expect(DashboardHome()).rejects.toThrow("NEXT_REDIRECT:/dashboard/welcome");

    getMock.mockImplementation(async (_email: string, path: string) => (path === "/me" ? { id: "u1", email: "a@x.com", first_name: "Sam" } : []));
    await expect(DashboardHome()).resolves.toBeDefined();

    // The backend being unreachable is not a reason to send anyone to a form.
    getMock.mockResolvedValue(null);
    await expect(DashboardHome()).resolves.toBeDefined();
  });

  it("shows the recent activity and the mix of kinds when there are documents, and neither when there are none", async () => {
    getMock.mockImplementation(async (_email: string, path: string) =>
      path === "/documents" ? [{ ...doc("a", "ready"), created_at: "2026-10-30T10:00:00Z", status_changed_at: "2026-10-30T10:00:00Z" }] : [],
    );
    const withDocuments = await page();

    expect(withDocuments).toContain('aria-labelledby="activity-heading"');
    expect(withDocuments).toContain('aria-labelledby="kinds-heading"');
    expect(withDocuments).toContain("a.pdf");

    getMock.mockResolvedValue([]);
    const empty = await page();
    expect(empty).not.toContain("activity-heading");
    expect(empty).not.toContain("kinds-heading");
  });

  it("has no Coming up section", async () => {
    expect(await page()).not.toContain("Coming up");
  });

  it("shows the questions still to ask and what Brief found, from what is already worked out", async () => {
    getMock.mockImplementation(async (_email: string, path: string) => {
      if (path === "/documents") return [doc("a", "ready")];
      if (path === "/me/insights") {
        return [{ document_id: "a", terms_found: 9, terms_total: 12, questions_answered: 7, open_count: 1, open_questions: ["Does it renew automatically?"] }];
      }
      return [];
    });

    const html = await page();

    expect(html).toContain('aria-labelledby="still-to-ask-heading"');
    expect(html).toContain("Does it renew automatically?");
    expect(html).toContain('aria-labelledby="analysis-heading"');
  });

  it("leaves both out, and still shows the page, when nothing is worked out yet or it cannot be had", async () => {
    getMock.mockImplementation(async (_email: string, path: string) => (path === "/documents" ? [doc("a", "ready")] : null));

    const html = await page();

    expect(html).toContain("Dashboard");
    expect(html).not.toContain("still-to-ask-heading");
    expect(html).not.toContain("analysis-heading");
  });

  it("lets the sections rise into place one after another, the way to add a document first", async () => {
    const html = await page();

    expect(html.match(/motion-safe:animate-in/g)?.length).toBeGreaterThanOrEqual(5);
    const delays = [...html.matchAll(/animation-delay:(\d+)ms/g)].map((match) => Number(match[1]));
    expect(delays).toEqual([...delays].sort((a, b) => a - b));
    expect(delays.length).toBeGreaterThanOrEqual(4);
  });

  it("has no All documents button, since Documents is one click away in the top bar", async () => {
    const html = await page();

    expect(html).not.toContain("All documents");
    expect(html).toContain('href="/dashboard/documents"');
  });

  it("orders the sections by how often they are wanted: what Brief found and recent activity up high, still to ask last", async () => {
    getMock.mockImplementation(async (_email: string, path: string) => {
      if (path === "/documents") return [{ ...doc("a", "ready"), created_at: "2026-10-30T10:00:00Z", status_changed_at: "2026-10-30T10:00:00Z" }];
      if (path === "/me/insights") {
        return [{ document_id: "a", terms_found: 9, terms_total: 12, questions_answered: 7, open_count: 1, open_questions: ["Does it renew automatically?"] }];
      }
      return [];
    });

    const html = await page();
    const order = ["Your documents at a glance", "Add documents", "analysis-heading", "activity-heading", "kinds-heading", "still-to-ask-heading"].map((marker) => html.indexOf(marker));

    expect(order.every((position) => position > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("shows what was shared with the reader, above the upload card, and nothing when no one shared", async () => {
    getMock.mockImplementation(async (_email: string, path: string) =>
      path === "/shared" ? [{ id: "s1", owner_email: "mum@example.com", owner_name: "Asha Rao", status: "active" }] : [],
    );

    const html = await page();

    expect(html).toContain("Shared with you");
    expect(html).toContain("Asha Rao");
    expect(html.indexOf("Shared with you")).toBeLessThan(html.indexOf("Add documents"));

    getMock.mockResolvedValue([]);
    expect(await page()).not.toContain("Shared with you");
  });
});
