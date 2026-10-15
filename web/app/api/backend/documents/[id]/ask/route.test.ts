import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/proxy", () => ({ proxyPost: vi.fn() }));

import { proxyPost } from "@/lib/proxy";
import { POST } from "./route";

const postMock = vi.mocked(proxyPost);

beforeEach(() => {
  postMock.mockReset();
});

const context = (id: string) => ({ params: Promise.resolve({ id }) });
const ask = (body: string) => new Request("http://localhost/x", { method: "POST", body });

describe("POST /api/backend/documents/[id]/ask", () => {
  it("passes the question on to the backend through the shared proxy", async () => {
    postMock.mockResolvedValue(Response.json({ found: true, answer: "$1,450" }));

    const res = await POST(ask('{"question":"What is the deposit?"}'), context("d1"));

    expect(postMock).toHaveBeenCalledExactlyOnceWith("/documents/d1/ask", {
      question: "What is the deposit?",
    });
    expect(await res.json()).toEqual({ found: true, answer: "$1,450" });
  });

  it("answers 400 and never calls the backend when the body is not JSON", async () => {
    const res = await POST(ask("what?"), context("d1"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ detail: "invalid request" });
    expect(postMock).not.toHaveBeenCalled();
  });

  it("keeps a daily limit refusal from the backend as it is", async () => {
    postMock.mockResolvedValue(
      Response.json({ detail: "You have used all of today's questions." }, { status: 429 }),
    );

    const res = await POST(ask('{"question":"x"}'), context("d1"));

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ detail: "You have used all of today's questions." });
  });

  it("escapes the document id in the address", async () => {
    postMock.mockResolvedValue(Response.json({}));

    await POST(ask('{"question":"x"}'), context("d1/../../me"));

    expect(postMock).toHaveBeenCalledWith("/documents/d1%2F..%2F..%2Fme/ask", { question: "x" });
  });
});
