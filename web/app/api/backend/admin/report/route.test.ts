import { beforeEach, describe, expect, it, vi } from "vitest";

const proxyGet = vi.fn(async (path: string) => Response.json({ path }));
vi.mock("@/lib/proxy", () => ({ proxyGet: (path: string) => proxyGet(path) }));

import { GET } from "./route";

const call = (query: string) => GET(new Request(`http://site/api/backend/admin/report?${query}`));

beforeEach(() => proxyGet.mockClear());

describe("the report route", () => {
  it("passes a day or a month on to the backend", async () => {
    expect(await (await call("period=day&date=2026-11-12")).json()).toEqual({ path: "/admin/report?period=day&date=2026-11-12" });
    expect(proxyGet).toHaveBeenLastCalledWith("/admin/report?period=day&date=2026-11-12");
    await call("period=month&date=2026-11-01");
    expect(proxyGet).toHaveBeenLastCalledWith("/admin/report?period=month&date=2026-11-01");
  });

  it.each(["", "period=year&date=2026-11-12", "period=day", "period=day&date=yesterday", "period=day&date=2026-11-12%0d%0aX-Evil:1", "date=2026-11-12"])("turns away %s with a plain message, and asks the backend nothing", async (query) => {
    const response = await call(query);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ detail: "choose a day or a month" });
    expect(proxyGet).not.toHaveBeenCalled();
  });

  it("passes on only the period and the date, whatever else is in the address", async () => {
    await call("period=day&date=2026-11-12&admin=1&path=/me");

    expect(proxyGet).toHaveBeenCalledWith("/admin/report?period=day&date=2026-11-12");
  });
});
