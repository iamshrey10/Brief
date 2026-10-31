import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchUsage, questionsLeftNote, parseUsage, usageRows, type UsageEntry } from "./usage";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const entry = (used: number, limit = 100): UsageEntry => ({ used, limit, left: Math.max(limit - used, 0) });
const usage = {
  ask: entry(3),
  read: entry(1, 30),
  analyze: entry(0, 60),
};
const reply = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe("fetchUsage", () => {
  it("asks the usage route and returns the numbers", async () => {
    fetchMock.mockResolvedValue(reply(usage));

    expect(await fetchUsage()).toEqual({ ok: true, usage });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/backend/me/usage");
  });

  it("does not ask for a cached copy, since the numbers change as the person works", async () => {
    fetchMock.mockResolvedValue(reply(usage));

    await fetchUsage();

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });

  it.each([401, 429, 500, 502])("quietly gives nothing for a %i, because this is only a hint", async (status) => {
    fetchMock.mockResolvedValue(reply({ detail: "x" }, status));

    expect(await fetchUsage()).toEqual({ ok: false });
  });

  it("gives nothing when the request itself fails, and never throws", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));

    await expect(fetchUsage()).resolves.toEqual({ ok: false });
  });

  it.each([
    ["an empty object", {}],
    ["null", null],
    ["a missing kind", { ask: entry(1), read: entry(1) }],
    ["a number that is text", { ...usage, ask: { used: "3", limit: 100, left: 97 } }],
    ["a missing number", { ...usage, ask: { used: 3, limit: 100 } }],
    ["a negative number", { ...usage, ask: { used: 3, limit: 100, left: -1 } }],
    ["a number that is not finite", { ...usage, ask: { used: 3, limit: 100, left: Number.NaN } }],
  ])("gives nothing for a reply with %s, instead of showing something wrong", async (_name, body) => {
    fetchMock.mockResolvedValue(reply(body));

    expect(await fetchUsage()).toEqual({ ok: false });
  });

  it("gives nothing when the reply is not JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    } as unknown as Response);

    expect(await fetchUsage()).toEqual({ ok: false });
  });
});

describe("questionsLeftNote", () => {
  it("says nothing while there are plenty left, so it does not nag", () => {
    expect(questionsLeftNote(entry(0))).toBeNull();
    expect(questionsLeftNote(entry(89))).toBeNull();
  });

  it("starts saying how many are left once ten or fewer remain", () => {
    expect(questionsLeftNote(entry(90))).toBe("10 questions left today");
    expect(questionsLeftNote(entry(95))).toBe("5 questions left today");
  });

  it("says one question, not one questions", () => {
    expect(questionsLeftNote(entry(99))).toBe("1 question left today");
  });

  it("says plainly when none are left and when to come back", () => {
    expect(questionsLeftNote(entry(100))).toBe("You have used all of today's questions. Try again tomorrow.");
    expect(questionsLeftNote({ used: 120, limit: 100, left: 0 })).toBe(
      "You have used all of today's questions. Try again tomorrow.",
    );
  });

  it("says nothing for numbers that make no sense", () => {
    expect(questionsLeftNote({ used: 0, limit: 0, left: 0 })).toBeNull();
    expect(questionsLeftNote({ used: 0, limit: 100, left: -3 })).toBeNull();
    expect(questionsLeftNote({ used: 0, limit: 100, left: Number.NaN })).toBeNull();
  });

  it("never uses an em dash", () => {
    for (const used of [90, 99, 100]) expect(questionsLeftNote(entry(used))).not.toContain("—");
  });
});

describe("usageRows", () => {
  const usage = {
    ask: { used: 25, limit: 100, left: 75 },
    read: { used: 30, limit: 30, left: 0 },
    analyze: { used: 0, limit: 60, left: 60 },
  };

  it("gives one row per limit in a fixed order, with the names a person uses", () => {
    expect(usageRows(usage).map((row) => [row.kind, row.label])).toEqual([
      ["ask", "Questions"],
      ["read", "Document reads"],
      ["analyze", "Overviews"],
    ]);
  });

  it("shows how full each limit is as a whole percentage", () => {
    expect(usageRows(usage).map((row) => row.percent)).toEqual([25, 100, 0]);
    expect(usageRows({ ...usage, ask: { used: 1, limit: 3, left: 2 } })[0].percent).toBe(33);
  });

  it("never goes past full, and treats a limit of zero as full", () => {
    expect(usageRows({ ...usage, ask: { used: 130, limit: 100, left: 0 } })[0].percent).toBe(100);
    expect(usageRows({ ...usage, ask: { used: 0, limit: 0, left: 0 } })[0].percent).toBe(100);
  });

  it("gives each row a plain line about what uses it up", () => {
    expect(usageRows(usage).map((row) => row.hint)).toEqual([
      expect.stringContaining("Ask tab"),
      expect.stringContaining("Try again"),
      expect.stringContaining("free"),
    ]);
  });

  it("passes the counts through unchanged", () => {
    expect(usageRows(usage)[0]).toMatchObject({ used: 25, limit: 100, left: 75 });
  });
});

describe("parseUsage", () => {
  const good = {
    ask: { used: 1, limit: 100, left: 99 },
    read: { used: 0, limit: 30, left: 30 },
    analyze: { used: 0, limit: 60, left: 60 },
  };

  it("keeps a reply that has all three limits with counts", () => {
    expect(parseUsage(good)).toEqual(good);
  });

  it.each([
    ["nothing", null],
    ["text", "ok"],
    ["a missing limit", { ask: good.ask, read: good.read }],
    ["a negative count", { ...good, ask: { used: -1, limit: 100, left: 99 } }],
    ["a count that is not a number", { ...good, read: { used: "0", limit: 30, left: 30 } }],
  ])("throws away %s", (_name, body) => {
    expect(parseUsage(body)).toBeNull();
  });
});
