import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/proxy", () => ({ proxyGet: vi.fn() }));

import { proxyGet } from "@/lib/proxy";
import { GET } from "./route";

const getMock = vi.mocked(proxyGet);
const context = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => getMock.mockReset());

describe("GET /api/backend/documents/[id]/file", () => {
  it("sends the browser to the short-lived link for that document", async () => {
    getMock.mockResolvedValue(Response.json({ url: "https://files.example/abc?sig=1", content_type: "application/pdf" }));

    const response = await GET(new Request("http://localhost/x"), context("doc 1"));

    expect(getMock).toHaveBeenCalledExactlyOnceWith("/documents/doc%201/file");
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://files.example/abc?sig=1");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("passes a refusal on as it is, without redirecting anywhere", async () => {
    getMock.mockResolvedValue(Response.json({ detail: "document not found" }, { status: 404 }));

    const response = await GET(new Request("http://localhost/x"), context("doc-1"));

    expect(response.status).toBe(404);
    expect(response.headers.get("Location")).toBeNull();
  });

  it.each([{ url: "javascript:alert(1)" }, { url: 5 }, {}])("never redirects to %o", async (body) => {
    getMock.mockResolvedValue(Response.json(body));

    const response = await GET(new Request("http://localhost/x"), context("doc-1"));

    expect(response.status).toBe(502);
    expect(response.headers.get("Location")).toBeNull();
  });
});
