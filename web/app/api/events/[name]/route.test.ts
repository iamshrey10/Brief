import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/service-token", () => ({ mintServiceToken: vi.fn(async (who: string) => `token-for-${who}`) }));

import { POST } from "./route";

const call = (name: string) => POST(new Request("http://site/api/events/x", { method: "POST" }), { params: Promise.resolve({ name }) });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("counting that something happened", () => {
  it.each(["demo_opened", "demo_finished"])("passes %s on with the token made for a visitor, and answers 204", async (name) => {
    const response = await call(name);

    expect(response.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(new RegExp(`/events/${name}$`));
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer token-for-site-visitor");
  });

  it("sends nothing about who it was: no cookie, no address, no body", async () => {
    await call("demo_opened");

    const init = fetchMock.mock.calls[0][1];
    expect(Object.keys(init.headers)).toEqual(["Authorization"]);
    expect(init.body).toBeUndefined();
  });

  it("does nothing, and still answers 204, for a name that is not on the list", async () => {
    for (const name of ["something_else", "../admin/stats", "DEMO_OPENED", ""]) {
      expect((await call(name)).status).toBe(204);
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never gets in the way of the page, even when the backend cannot be reached", async () => {
    fetchMock.mockRejectedValue(new Error("down"));

    expect((await call("demo_opened")).status).toBe(204);
  });
});
