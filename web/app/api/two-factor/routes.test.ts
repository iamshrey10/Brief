import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, { value: string; options: Record<string, unknown> }>();
const deleted: string[] = [];
vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: (name: string, value: string, options: Record<string, unknown>) => jar.set(name, { value, options }),
    get: (name: string) => (jar.has(name) ? { value: jar.get(name)!.value } : undefined),
    delete: (name: string) => deleted.push(name),
  }),
}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/two-factor-server", () => ({ callBackend: vi.fn() }));

import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { callBackend } from "@/lib/two-factor-server";
import { twoFactorSettled } from "@/lib/two-factor-cookie";
import { POST as disable } from "./disable/route";
import { POST as enable } from "./enable/route";
import { POST as verify } from "./verify/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const limitMock = vi.mocked(checkRateLimit);
const backendMock = vi.mocked(callBackend);
const answer = (status: number, body: unknown = null, retryAfter: string | null = null) => ({ status, body, retryAfter });
const post = (body: string) => new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json" }, body });

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", "a-secret-for-the-route-tests-0123456789abcdef");
  jar.clear();
  deleted.length = 0;
  authMock.mockReset();
  limitMock.mockReset();
  backendMock.mockReset();
  authMock.mockResolvedValue({ user: { email: "a@x.com" } });
  limitMock.mockResolvedValue(true);
});

describe.each([
  ["verify", verify, "/me/2fa/verify"],
  ["enable", enable, "/me/2fa/enable"],
  ["disable", disable, "/me/2fa/disable"],
])("the %s route", (_name, handler, path) => {
  it("turns away someone who is not signed in, asking the backend nothing", async () => {
    authMock.mockResolvedValue(null);

    expect((await handler(post('{"code":"123456"}'))).status).toBe(401);
    expect(backendMock).not.toHaveBeenCalled();
  });

  it("turns away someone over the rate limit, asking the backend nothing", async () => {
    limitMock.mockResolvedValue(false);

    expect((await handler(post('{"code":"123456"}'))).status).toBe(429);
    expect(backendMock).not.toHaveBeenCalled();
  });

  it.each(["not json", "{}", '{"code":5}', '{"code":""}', '{"code":"   "}', `{"code":"${"x".repeat(33)}"}`])("refuses the body %s without asking the backend", async (body) => {
    const response = await handler(post(body));

    expect(response.status).toBe(400);
    expect(backendMock).not.toHaveBeenCalled();
    expect(jar.size).toBe(0);
  });

  it("answers wrong for a code the backend refuses, and settles nothing", async () => {
    backendMock.mockResolvedValue(answer(400));

    const response = await handler(post('{"code":"000000"}'));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "wrong" });
    expect(jar.size).toBe(0);
    expect(backendMock.mock.calls[0][2]).toBe(path);
  });

  it("answers locked, with how long to wait, when the backend says so, and settles nothing", async () => {
    backendMock.mockResolvedValue(answer(429, null, "900"));

    const response = await handler(post('{"code":"000000"}'));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("900");
    expect(await response.json()).toEqual({ error: "locked" });
    expect(jar.size).toBe(0);
  });

  it("answers unavailable, never a pass, when the backend cannot be reached or answers oddly", async () => {
    backendMock.mockResolvedValue(answer(502));
    expect((await handler(post('{"code":"123456"}'))).status).toBe(502);
    backendMock.mockResolvedValue(answer(500));
    expect((await handler(post('{"code":"123456"}'))).status).toBe(502);
    expect(jar.size).toBe(0);
  });
});

describe("giving a code at sign in", () => {
  it("settles the check for this person, in a cookie that cannot be read by scripts", async () => {
    backendMock.mockResolvedValue(answer(200, { device_token: null, used_recovery_code: false }));

    const response = await verify(post('{"code":"123456","remember":false}'));

    expect(await response.json()).toEqual({ ok: true, usedRecoveryCode: false });
    expect(await twoFactorSettled(jar.get("brief_2fa")?.value, "a@x.com")).toBe(true);
    expect(jar.get("brief_2fa")?.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(jar.has("brief_device")).toBe(false);
    expect(backendMock).toHaveBeenCalledWith("a@x.com", "POST", "/me/2fa/verify", { code: "123456", remember: false });
  });

  it("keeps the browser remembered for thirty days when it was asked to, and says a recovery code was used", async () => {
    backendMock.mockResolvedValue(answer(200, { device_token: "device-secret", used_recovery_code: true }));

    const response = await verify(post('{"code":"AAAAA-BBBBB","remember":true}'));

    expect(await response.json()).toEqual({ ok: true, usedRecoveryCode: true });
    expect(jar.get("brief_device")).toMatchObject({ value: "device-secret", options: { httpOnly: true, maxAge: 30 * 24 * 60 * 60 } });
    expect(backendMock.mock.calls[0][3]).toEqual({ code: "AAAAA-BBBBB", remember: true });
  });

  it("only remembers when asked for exactly true", async () => {
    backendMock.mockResolvedValue(answer(200, { device_token: null }));

    await verify(post('{"code":"123456","remember":"yes"}'));

    expect(backendMock.mock.calls[0][3]).toEqual({ code: "123456", remember: false });
  });
});

describe("turning it on", () => {
  it("passes the recovery codes on, once, and settles this browser so the person is not locked out", async () => {
    backendMock.mockResolvedValue(answer(200, { recovery_codes: ["AAAAA-BBBBB", 7, "CCCCC-DDDDD"] }));

    const response = await enable(post('{"code":"123456"}'));

    expect(await response.json()).toEqual({ recoveryCodes: ["AAAAA-BBBBB", "CCCCC-DDDDD"] });
    expect(await twoFactorSettled(jar.get("brief_2fa")?.value, "a@x.com")).toBe(true);
  });

  it("says there is no setup waiting", async () => {
    backendMock.mockResolvedValue(answer(409));

    const response = await enable(post('{"code":"123456"}'));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "no setup" });
  });

  it("does not claim success when the answer has no recovery codes", async () => {
    backendMock.mockResolvedValue(answer(200, {}));

    expect((await enable(post('{"code":"123456"}'))).status).toBe(502);
    expect(jar.size).toBe(0);
  });
});

describe("turning it off", () => {
  it("settles the check as needing nothing, and forgets the remembered browser", async () => {
    backendMock.mockResolvedValue(answer(200, { enabled: false }));

    const response = await disable(post('{"code":"123456"}'));

    expect(await response.json()).toEqual({ ok: true });
    expect(await twoFactorSettled(jar.get("brief_2fa")?.value, "a@x.com")).toBe(true);
    expect(deleted).toEqual(["brief_device"]);
  });

  it("says it is not on", async () => {
    backendMock.mockResolvedValue(answer(409));

    const response = await disable(post('{"code":"123456"}'));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "not on" });
  });
});
