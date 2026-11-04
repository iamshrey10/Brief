import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { value: jar.get(name)! } : undefined), set: (name: string, value: string) => jar.set(name, value) }),
}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/two-factor-server", () => ({ callBackend: vi.fn() }));
vi.mock("@/components/verify-form", () => ({ VerifyForm: ({ next, problem }: { next: string; problem: boolean }) => <div data-testid="form">{`${next}|${problem}`}</div> }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));

import { auth } from "@/auth";
import { callBackend } from "@/lib/two-factor-server";
import { twoFactorSettled } from "@/lib/two-factor-cookie";
import { GET as check } from "./check/route";
import VerifyPage, { metadata } from "./verify/page";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const backendMock = vi.mocked(callBackend);
const answer = (status: number, body: unknown = null) => ({ status, body, retryAfter: null });
const go = (query: string) => check(new Request(`http://localhost:3000/two-factor/check${query}`));

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", "a-secret-for-the-page-tests-0123456789abcdef");
  jar.clear();
  authMock.mockReset();
  backendMock.mockReset();
  authMock.mockResolvedValue({ user: { email: "a@x.com" } });
});

describe("the check", () => {
  it("sends someone who is not signed in to the landing page", async () => {
    authMock.mockResolvedValue(null);

    expect((await go("?next=%2Fdashboard")).headers.get("location")).toBe("http://localhost:3000/");
    expect(backendMock).not.toHaveBeenCalled();
  });

  it("lets someone through to where they were going when no code is needed, and records that", async () => {
    backendMock.mockResolvedValue(answer(200, { required: false, trusted: false }));

    const response = await go("?next=%2Fdashboard%2Fprofile");

    expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard/profile");
    expect(await twoFactorSettled(jar.get("brief_2fa"), "a@x.com")).toBe(true);
  });

  it("lets a remembered browser through, and sends the browser's secret to be checked", async () => {
    jar.set("brief_device", "the-device-secret");
    backendMock.mockResolvedValue(answer(200, { required: true, trusted: true }));

    const response = await go("?next=%2Fdashboard");

    expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard");
    expect(backendMock).toHaveBeenCalledWith("a@x.com", "POST", "/me/2fa/check", { device_token: "the-device-secret" });
    expect(await twoFactorSettled(jar.get("brief_2fa"), "a@x.com")).toBe(true);
  });

  it("asks for a code when one is needed and the browser is not remembered, and settles nothing", async () => {
    backendMock.mockResolvedValue(answer(200, { required: true, trusted: false }));

    const response = await go("?next=%2Fdashboard%2Fdocuments");

    expect(response.headers.get("location")).toBe("http://localhost:3000/two-factor/verify?next=%2Fdashboard%2Fdocuments");
    expect(jar.has("brief_2fa")).toBe(false);
    expect(backendMock.mock.calls[0][3]).toEqual({ device_token: null });
  });

  it.each([answer(502), answer(500), answer(200, {}), answer(200, { required: "yes" })])("never lets anyone through when the backend cannot say (%j)", async (reply) => {
    backendMock.mockResolvedValue(reply);

    const response = await go("?next=%2Fdashboard");

    expect(response.headers.get("location")).toBe("http://localhost:3000/two-factor/verify?next=%2Fdashboard&problem=1");
    expect(jar.has("brief_2fa")).toBe(false);
  });

  it.each(["?next=https://evil.example", "?next=//evil.example", "", "?next=/other"])("never sends anyone away from the site (%s)", async (query) => {
    backendMock.mockResolvedValue(answer(200, { required: false, trusted: false }));

    expect((await go(query)).headers.get("location")).toBe("http://localhost:3000/dashboard");
  });
});

describe("the code page", () => {
  it("sends someone who is not signed in to the landing page", async () => {
    authMock.mockResolvedValue(null);

    await expect(VerifyPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT:/");
  });

  it("asks for the code, with one heading, naming who is signed in, and goes on to a safe place", async () => {
    const html = renderToStaticMarkup(await VerifyPage({ searchParams: Promise.resolve({ next: "/dashboard/profile" }) }));

    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("Verify it is you");
    expect(html).toContain("a@x.com");
    expect(html).toContain("/dashboard/profile|false");
  });

  it("never goes on to somewhere outside the site, and passes on that the check could not be made", async () => {
    const html = renderToStaticMarkup(await VerifyPage({ searchParams: Promise.resolve({ next: "https://evil.example", problem: "1" }) }));

    expect(html).toContain("/dashboard|true");
  });

  it("is not indexed", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
