import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { securityHeaderRules, securityHeaders } from "./security-headers";

const byKey = () => Object.fromEntries(securityHeaders.map((h) => [h.key, h.value]));

describe("securityHeaders", () => {
  it("stops the browser guessing what a file is", () => {
    expect(byKey()["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("stops the site being shown inside another page, in both the old and the current way", () => {
    expect(byKey()["X-Frame-Options"]).toBe("DENY");
    expect(byKey()["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  });

  it("keeps the address of a private page out of what other sites are told", () => {
    expect(byKey()["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("asks browsers to use HTTPS only, for at least a year", () => {
    const value = byKey()["Strict-Transport-Security"];
    const maxAge = Number(/max-age=(\d+)/.exec(value)?.[1]);

    expect(maxAge).toBeGreaterThanOrEqual(60 * 60 * 24 * 365);
    expect(value).toContain("includeSubDomains");
  });

  it("turns off camera, microphone and location, which the site never uses", () => {
    const value = byKey()["Permissions-Policy"];

    for (const feature of ["camera", "microphone", "geolocation"]) {
      expect(value).toContain(`${feature}=()`);
    }
  });

  it("lists each header once, with a value", () => {
    const keys = securityHeaders.map((h) => h.key);

    expect(new Set(keys).size).toBe(keys.length);
    for (const header of securityHeaders) expect(header.value.trim()).not.toBe("");
  });

  it("uses no em dash", () => {
    for (const header of securityHeaders) expect(header.value).not.toContain("—");
  });
});

describe("securityHeaderRules", () => {
  it("applies the headers to every page and every API route", () => {
    expect(securityHeaderRules()).toEqual([{ source: "/:path*", headers: securityHeaders }]);
  });
});

describe("next.config", () => {
  it("sends the security headers", async () => {
    expect(await nextConfig.headers?.()).toEqual(securityHeaderRules());
  });
});
