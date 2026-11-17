import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/proxy", () => ({ proxyGet: vi.fn(), proxyPost: vi.fn(), proxyDelete: vi.fn(), proxyPatch: vi.fn() }));

import { proxyDelete, proxyGet, proxyPatch, proxyPost } from "@/lib/proxy";
import { DELETE, PATCH } from "./[id]/route";
import { GET, POST } from "./route";

const getMock = vi.mocked(proxyGet);
const postMock = vi.mocked(proxyPost);
const deleteMock = vi.mocked(proxyDelete);
const patchMock = vi.mocked(proxyPatch);
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (method: string, body: string) => new Request("http://localhost/x", { method, headers: { "Content-Type": "application/json" }, body });

beforeEach(() => {
  for (const mock of [getMock, postMock, deleteMock, patchMock]) {
    mock.mockReset();
    mock.mockResolvedValue(Response.json({ ok: true }));
  }
});

describe("the reminder routes", () => {
  it("list the signed-in person's reminders", async () => {
    await GET();
    expect(getMock).toHaveBeenCalledExactlyOnceWith("/me/reminders");
  });

  it("add a reminder by passing the body on", async () => {
    await POST(json("POST", '{"title":"Call","due_date":"2026-12-01"}'));
    expect(postMock).toHaveBeenCalledExactlyOnceWith("/me/reminders", { title: "Call", due_date: "2026-12-01" });
  });

  it("refuse a body that is not JSON, without asking the backend", async () => {
    const response = await POST(json("POST", "not json"));
    expect(response.status).toBe(400);
    expect(postMock).not.toHaveBeenCalled();
  });

  it("change or complete one reminder, passing the change on and naming it safely", async () => {
    await PATCH(json("PATCH", '{"completed":true}'), context("a/b"));
    expect(patchMock).toHaveBeenCalledExactlyOnceWith("/me/reminders/a%2Fb", { completed: true });
  });

  it("refuse a change that is not JSON, without asking the backend", async () => {
    const response = await PATCH(json("PATCH", "not json"), context("r1"));
    expect(response.status).toBe(400);
    expect(patchMock).not.toHaveBeenCalled();
  });

  it("delete one reminder, naming it safely", async () => {
    await DELETE(new Request("http://localhost/x", { method: "DELETE" }), context("r 1"));
    expect(deleteMock).toHaveBeenCalledExactlyOnceWith("/me/reminders/r%201");
  });
});
