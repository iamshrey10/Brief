import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cookieOptions, safeNext, signTwoFactor, twoFactorSettled } from "./two-factor-cookie";

const SECRET = "a-test-secret-that-is-long-enough-0123456789";
beforeEach(() => vi.stubEnv("AUTH_SECRET", SECRET));
afterEach(() => vi.unstubAllEnvs());

describe("the second step cookie", () => {
  it.each(["off", "ok"] as const)("a %s cookie is believed for the person it was made for", async (state) => {
    expect(await twoFactorSettled(await signTwoFactor("a@x.com", state), "a@x.com")).toBe(true);
  });

  it("is not believed for anyone else", async () => {
    expect(await twoFactorSettled(await signTwoFactor("a@x.com", "ok"), "b@x.com")).toBe(false);
  });

  it.each([undefined, "", "garbage", "a.b.c"])("is not believed when it is %j", async (value) => {
    expect(await twoFactorSettled(value, "a@x.com")).toBe(false);
  });

  it("is not believed when signed with another secret", async () => {
    const forged = await new SignJWT({ st: "ok" }).setProtectedHeader({ alg: "HS256" }).setSubject("a@x.com").setExpirationTime("1h").sign(new TextEncoder().encode("another-secret-entirely-0123456789abcdef"));

    expect(await twoFactorSettled(forged, "a@x.com")).toBe(false);
  });

  it("is not believed once expired, or when it says anything but off or ok, or has no expiry", async () => {
    const key = new TextEncoder().encode(SECRET);
    const expired = await new SignJWT({ st: "ok" }).setProtectedHeader({ alg: "HS256" }).setSubject("a@x.com").setExpirationTime(Math.floor(Date.now() / 1000) - 10).sign(key);
    const odd = await new SignJWT({ st: "maybe" }).setProtectedHeader({ alg: "HS256" }).setSubject("a@x.com").setExpirationTime("1h").sign(key);

    expect(await twoFactorSettled(expired, "a@x.com")).toBe(false);
    expect(await twoFactorSettled(odd, "a@x.com")).toBe(false);
  });

  it("is not believed if it was made with a different algorithm", async () => {
    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: "a@x.com", st: "ok", exp: 9999999999 })).toString("base64url")}.`;

    expect(await twoFactorSettled(none, "a@x.com")).toBe(false);
  });

  it("refuses to be made in production without a real secret", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "short");

    await expect(signTwoFactor("a@x.com", "ok")).rejects.toThrow("AUTH_SECRET is not set to a real secret");
  });
});

describe("where to go afterwards", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/dashboard/profile", "/dashboard/profile"],
    ["/dashboard/documents?x=1", "/dashboard/documents?x=1"],
    ["/dashboard/documents/abc#top", "/dashboard/documents/abc#top"],
  ])("keeps %s", (value, expected) => expect(safeNext(value)).toBe(expected));

  it.each([null, undefined, "", "https://evil.example", "//evil.example", "/\\evil.example", "/dashboardevil", "/other", "/dashboard\\x", "javascript:alert(1)", "/dashboard x"])(
    "turns %j into the Dashboard",
    (value) => expect(safeNext(value)).toBe("/dashboard"),
  );
});

describe("the cookie settings", () => {
  it("are unreadable by scripts and sent only to this site", () => {
    expect(cookieOptions(60)).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 });
  });

  it("insist on HTTPS in production only", () => {
    expect(cookieOptions(1).secure).toBe(false);
    vi.stubEnv("NODE_ENV", "production");
    expect(cookieOptions(1).secure).toBe(true);
  });
});
