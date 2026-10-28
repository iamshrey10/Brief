import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import * as proxyModule from "./proxy";

describe("the proxy that turns visitors away", () => {
  it("is exported under the name proxy, which Next looks for, and not under the old name middleware", () => {
    expect(typeof proxyModule.proxy).toBe("function");
    expect(proxyModule).not.toHaveProperty("middleware");
  });

  it("guards the dashboard and everything under it, and nothing else", () => {
    expect(proxyModule.config.matcher).toEqual(["/dashboard/:path*"]);
  });
});
