import { describe, expect, it } from "vitest";
import { dailyLimitMessage } from "./daily-limit";

function reply(status: number, body: unknown): Pick<Response, "status" | "json"> {
  return { status, json: async () => body };
}

const DETAIL = "You have reached today's limit of 100 questions. Try again tomorrow.";

describe("dailyLimitMessage", () => {
  it("gives the server's own sentence when the daily limit was reached", async () => {
    expect(await dailyLimitMessage(reply(429, { detail: DETAIL }))).toBe(DETAIL);
  });

  it("gives nothing for the website's own per-minute limit, which has no detail", async () => {
    expect(await dailyLimitMessage(reply(429, { error: "too many requests" }))).toBeNull();
  });

  it.each([200, 400, 401, 404, 409, 422, 500, 502])(
    "gives nothing for a %i, even if it carries a detail",
    async (status) => {
      expect(await dailyLimitMessage(reply(status, { detail: DETAIL }))).toBeNull();
    },
  );

  it.each([[{}], [null], [{ detail: "" }], [{ detail: "   " }], [{ detail: 5 }], [{ detail: ["a"] }]])(
    "gives nothing when a 429 has no usable detail, here %j",
    async (body) => {
      expect(await dailyLimitMessage(reply(429, body))).toBeNull();
    },
  );

  it("gives nothing when the body is not JSON", async () => {
    const broken = {
      status: 429,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    };

    expect(await dailyLimitMessage(broken)).toBeNull();
  });
});
