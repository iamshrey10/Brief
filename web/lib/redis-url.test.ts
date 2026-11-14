import { describe, expect, it } from "vitest";

import { cleanRedisUrl, redisUrlProblem } from "./redis-url";

const GOOD = "rediss://default:s3cret@fine-name-12345.upstash.io:6379";

describe("cleanRedisUrl", () => {
  it("leaves a good address alone", () => {
    expect(cleanRedisUrl(GOOD)).toBe(GOOD);
  });

  it("removes spaces and line breaks at either end", () => {
    expect(cleanRedisUrl(`  ${GOOD}\n`)).toBe(GOOD);
    expect(cleanRedisUrl(`\r\n${GOOD}\r\n`)).toBe(GOOD);
  });

  it("removes quotes around it", () => {
    expect(cleanRedisUrl(`"${GOOD}"`)).toBe(GOOD);
    expect(cleanRedisUrl(`'${GOOD}'`)).toBe(GOOD);
  });

  it("keeps only the address when the whole command line was pasted", () => {
    expect(cleanRedisUrl(`redis-cli --tls -u ${GOOD}`)).toBe(GOOD);
  });

  it("turns plain redis:// into rediss:// for an Upstash host, which accepts TLS only", () => {
    expect(cleanRedisUrl("redis://default:pw@x-1.upstash.io:6379")).toBe("rediss://default:pw@x-1.upstash.io:6379");
  });

  it("does not change redis:// for any other host", () => {
    expect(cleanRedisUrl("redis://localhost:6379")).toBe("redis://localhost:6379");
  });

  it("falls back to the local address when nothing is set", () => {
    expect(cleanRedisUrl(undefined)).toBe("redis://localhost:6379");
    expect(cleanRedisUrl("")).toBe("redis://localhost:6379");
  });
});

describe("redisUrlProblem", () => {
  it("is null for a good address, even one that needed tidying", () => {
    expect(redisUrlProblem(GOOD)).toBeNull();
    expect(redisUrlProblem(` ${GOOD}\n`)).toBeNull();
  });

  it("names what is wrong without quoting the value", () => {
    const secret = "very-secret-password";
    for (const bad of [undefined, "", "   ", `default:${secret}@host:6379`, `rediss://default:${secret}@:6379`, `rediss://default:${secret}@host:port`]) {
      const problem = redisUrlProblem(bad);
      expect(problem).not.toBeNull();
      expect(problem).not.toContain(secret);
      expect(problem).not.toContain("host");
    }
  });
});
