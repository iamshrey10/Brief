import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/proxy", () => ({ proxyGet: vi.fn(), proxyPost: vi.fn(), proxyDelete: vi.fn() }));

import { proxyDelete, proxyGet, proxyPost } from "@/lib/proxy";
import { DELETE } from "./[id]/route";
import { POST as approve } from "./[id]/approve/route";
import { POST as join } from "./join/route";
import { GET, POST } from "./route";

const getMock = vi.mocked(proxyGet);
const postMock = vi.mocked(proxyPost);
const deleteMock = vi.mocked(proxyDelete);
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (body: string) => new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json" }, body });

beforeEach(() => {
  for (const mock of [getMock, postMock, deleteMock]) {
    mock.mockReset();
    mock.mockResolvedValue(Response.json({ ok: true }));
  }
});

describe("the sharing routes", () => {
  it("list the shares", async () => {
    await GET();
    expect(getMock).toHaveBeenCalledExactlyOnceWith("/shares");
  });

  it.each([
    ["make an invitation", POST, "/shares"],
    ["use an invitation", join, "/shares/join"],
  ])("%s by passing the body on", async (_name, handler, path) => {
    await handler(json('{"label":"Mum","code":"123456"}'));
    expect(postMock).toHaveBeenCalledExactlyOnceWith(path, { label: "Mum", code: "123456" });
  });

  it.each([
    ["make an invitation", POST],
    ["use an invitation", join],
  ])("refuse a body that is not JSON when asked to %s, without asking the backend", async (_name, handler) => {
    const response = await handler(json("not json"));
    expect(response.status).toBe(400);
    expect(postMock).not.toHaveBeenCalled();
  });

  it("approve one share, naming it safely", async () => {
    await approve(new Request("http://localhost/x", { method: "POST" }), context("a/b"));
    expect(postMock).toHaveBeenCalledExactlyOnceWith("/shares/a%2Fb/approve");
  });

  it("remove one share, naming it safely", async () => {
    await DELETE(new Request("http://localhost/x", { method: "DELETE" }), context("s 1"));
    expect(deleteMock).toHaveBeenCalledExactlyOnceWith("/shares/s%201");
  });
});
