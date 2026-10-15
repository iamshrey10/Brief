import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/proxy", () => ({ proxyGet: vi.fn(), proxyPost: vi.fn() }));

import { proxyGet, proxyPost } from "@/lib/proxy";
import { GET, POST } from "./route";

const getMock = vi.mocked(proxyGet);
const postMock = vi.mocked(proxyPost);

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
});

const jsonRequest = (body: string) =>
  new Request("http://localhost/api/backend/documents", { method: "POST", body });

describe("GET /api/backend/documents", () => {
  it("asks the backend for the person's documents through the shared proxy", async () => {
    getMock.mockResolvedValue(Response.json([{ id: "d1" }]));

    const res = await GET();

    expect(getMock).toHaveBeenCalledExactlyOnceWith("/documents");
    expect(await res.json()).toEqual([{ id: "d1" }]);
  });
});

describe("POST /api/backend/documents", () => {
  it("passes the body on to the backend through the shared proxy", async () => {
    postMock.mockResolvedValue(Response.json({ id: "d2" }, { status: 201 }));

    const res = await POST(jsonRequest('{"filename":"Lease.pdf","doc_type":"lease"}'));

    expect(postMock).toHaveBeenCalledExactlyOnceWith("/documents", {
      filename: "Lease.pdf",
      doc_type: "lease",
    });
    expect(res.status).toBe(201);
  });

  it("answers 400 and never calls the backend when the body is not JSON", async () => {
    const res = await POST(jsonRequest("not json at all"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ detail: "invalid request" });
    expect(postMock).not.toHaveBeenCalled();
  });
});
