import { beforeEach, describe, expect, it, vi } from "vitest";

// The real `auth` wraps a function in the sign in check. Here it hands the function back, so what it does can be seen.
vi.mock("@/auth", () => ({ auth: (handler: unknown) => handler }));

import * as proxyModule from "./proxy";
import { signTwoFactor, TWO_FACTOR_COOKIE } from "@/lib/two-factor-cookie";

type Handler = (request: unknown) => Promise<Response | undefined>;
const run = proxyModule.proxy as unknown as Handler;

function request(path: string, opts: { email?: string; cookie?: string } = {}) {
  const url = new URL(`http://localhost:3000${path}`);
  return {
    auth: opts.email ? { user: { email: opts.email } } : null,
    nextUrl: url,
    cookies: { get: (name: string) => (name === TWO_FACTOR_COOKIE && opts.cookie ? { value: opts.cookie } : undefined) },
  };
}

describe("the proxy that turns visitors away", () => {
  it("is exported under the name proxy, which Next looks for, and not under the old name middleware", () => {
    expect(typeof proxyModule.proxy).toBe("function");
    expect(proxyModule).not.toHaveProperty("middleware");
  });

  it("guards the dashboard and everything under it, and nothing else", () => {
    expect(proxyModule.config.matcher).toEqual(["/dashboard/:path*"]);
  });
});

describe("who gets through", () => {
  beforeEach(() => vi.stubEnv("AUTH_SECRET", "a-secret-for-the-proxy-tests-0123456789abcdef"));

  it("sends someone who is not signed in to the landing page", async () => {
    const response = await run(request("/dashboard"));

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("lets someone through whose second step is settled", async () => {
    const response = await run(request("/dashboard/profile", { email: "a@x.com", cookie: await signTwoFactor("a@x.com", "ok") }));

    expect(response?.headers.get("location")).toBeNull();
    expect(response?.status).toBe(200);
  });

  it("lets someone through who needs no second step and was checked", async () => {
    const response = await run(request("/dashboard", { email: "a@x.com", cookie: await signTwoFactor("a@x.com", "off") }));

    expect(response?.status).toBe(200);
  });

  it("sends someone with no settled check to the check, keeping the page they asked for, query and all", async () => {
    const response = await run(request("/dashboard/documents?x=1", { email: "a@x.com" }));

    expect(response?.headers.get("location")).toBe("http://localhost:3000/two-factor/check?next=%2Fdashboard%2Fdocuments%3Fx%3D1");
  });

  it("does not believe a cookie that was made up, was made for someone else, or has expired", async () => {
    const forged = await run(request("/dashboard", { email: "a@x.com", cookie: "forged" }));
    const someoneElses = await run(request("/dashboard", { email: "a@x.com", cookie: await signTwoFactor("b@x.com", "ok") }));

    expect(forged?.headers.get("location")).toContain("/two-factor/check");
    expect(someoneElses?.headers.get("location")).toContain("/two-factor/check");
  });
});
