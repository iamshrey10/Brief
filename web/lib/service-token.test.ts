import { jwtVerify } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mintServiceToken } from "./service-token";

const STRONG = "s".repeat(32);

afterEach(() => {
  vi.unstubAllEnvs();
});

function key(secret: string) {
  return new TextEncoder().encode(secret);
}

describe("mintServiceToken", () => {
  it("proves who the request is for, signed with the shared secret", async () => {
    vi.stubEnv("SERVICE_JWT_SECRET", STRONG);

    const token = await mintServiceToken("reader@example.com");
    const { payload, protectedHeader } = await jwtVerify(token, key(STRONG));

    expect(payload.sub).toBe("reader@example.com");
    expect(protectedHeader.alg).toBe("HS256");
  });

  it("expires after 60 seconds, so a leaked token is only briefly useful", async () => {
    vi.stubEnv("SERVICE_JWT_SECRET", STRONG);

    const { payload } = await jwtVerify(await mintServiceToken("a@b.c"), key(STRONG));

    expect(payload.exp).toBeDefined();
    expect(payload.iat).toBeDefined();
    expect((payload.exp as number) - (payload.iat as number)).toBe(60);
  });

  it("does not verify with any other secret", async () => {
    vi.stubEnv("SERVICE_JWT_SECRET", STRONG);
    const token = await mintServiceToken("a@b.c");

    await expect(jwtVerify(token, key("t".repeat(32)))).rejects.toThrow();
  });

  it("is signed with the secret from the environment each time, not one read at import", async () => {
    vi.stubEnv("SERVICE_JWT_SECRET", STRONG);
    const first = await mintServiceToken("a@b.c");
    vi.stubEnv("SERVICE_JWT_SECRET", "u".repeat(32));
    const second = await mintServiceToken("a@b.c");

    await expect(jwtVerify(first, key(STRONG))).resolves.toBeDefined();
    await expect(jwtVerify(second, key("u".repeat(32)))).resolves.toBeDefined();
    await expect(jwtVerify(second, key(STRONG))).rejects.toThrow();
  });

  it("carries only who it is for, nothing else about the person", async () => {
    vi.stubEnv("SERVICE_JWT_SECRET", STRONG);

    const { payload } = await jwtVerify(await mintServiceToken("a@b.c"), key(STRONG));

    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "sub"]);
  });
});

describe("the secret in production", () => {
  it("refuses to sign with the built-in development secret", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SERVICE_JWT_SECRET", "");

    await expect(mintServiceToken("a@b.c")).rejects.toThrow(/not set to a real secret/);
  });

  it("refuses a secret that is the built-in value even when it is set, and says why", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SERVICE_JWT_SECRET", "dev-only-secret-change-me");

    await expect(mintServiceToken("a@b.c")).rejects.toThrow(/not set to a real secret/);
  });

  it("refuses a secret shorter than 32 characters", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SERVICE_JWT_SECRET", "x".repeat(31));

    await expect(mintServiceToken("a@b.c")).rejects.toThrow(/32/);
  });

  it("accepts a secret of exactly 32 characters", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SERVICE_JWT_SECRET", STRONG);

    await expect(mintServiceToken("a@b.c")).resolves.toEqual(expect.any(String));
  });

  it.each(["short-secret-value", "dev-only-secret-change-me"])(
    "never puts the secret in the error, here %s",
    async (value) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("SERVICE_JWT_SECRET", value);

      const error = await mintServiceToken("a@b.c").catch((caught: Error) => caught);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(value);
    },
  );

  it("does not stop a build or a development run that has no secret set", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SERVICE_JWT_SECRET", "");

    await expect(mintServiceToken("a@b.c")).resolves.toEqual(expect.any(String));
  });
});
