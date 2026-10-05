import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchChecklist,
  fetchKeyTerms,
  groupChecklist,
  messageForFailure,
  splitKeyTerms,
  type ChecklistAnswer,
  type KeyTerm,
} from "./overview";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  fetchMock.mockReset();
});

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe("messageForFailure", () => {
  it.each([
    [401, /session expired/i],
    [409, /isn't ready/i],
    [429, /too many requests/i],
    [500, /couldn't read this document/i],
    [0, /couldn't read this document/i],
  ])("explains status %i in plain words", (status, pattern) => {
    expect(messageForFailure(status)).toMatch(pattern);
  });

  it("never shows a status code or raw error to the reader", () => {
    for (const status of [401, 409, 429, 500, 502, 0]) {
      expect(messageForFailure(status)).not.toMatch(/\b(401|409|429|500|502)\b/);
    }
  });
});

describe("fetchKeyTerms and fetchChecklist", () => {
  it("returns the parsed result on success", async () => {
    const body = { terms: [], truncated: false };
    fetchMock.mockResolvedValue(jsonResponse(body));

    expect(await fetchKeyTerms("doc-1")).toEqual({ ok: true, result: body });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/backend/documents/doc-1/key-terms");
  });

  it("asks the checklist route for the checklist", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ answers: [], truncated: false }));

    await fetchChecklist("doc-1");

    expect(fetchMock.mock.calls[0][0]).toBe("/api/backend/documents/doc-1/checklist");
  });

  it("encodes the document id", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ terms: [], truncated: false }));

    await fetchKeyTerms("a/b c");

    expect(fetchMock.mock.calls[0][0]).toBe("/api/backend/documents/a%2Fb%20c/key-terms");
  });

  it("turns an error status into a plain message", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: "x" }, 502));

    expect(await fetchChecklist("doc-1")).toEqual({
      ok: false,
      message: messageForFailure(502),
    });
  });

  it("turns a network failure into a plain message", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await fetchKeyTerms("doc-1")).toEqual({ ok: false, message: messageForFailure(0) });
  });

  it("gives up after the time limit instead of waiting forever", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
    );

    const pending = fetchChecklist("doc-1");
    await vi.advanceTimersByTimeAsync(90_000);

    expect(await pending).toEqual({ ok: false, message: "That took too long. Try again in a moment." });
  });

  it("shares one request between callers asking for the same thing at once", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ terms: [], truncated: false }));

    const [first, second] = await Promise.all([fetchKeyTerms("doc-1"), fetchKeyTerms("doc-1")]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("does not share a request across different documents or different kinds", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ terms: [], answers: [], truncated: false }));

    await Promise.all([fetchKeyTerms("doc-1"), fetchKeyTerms("doc-2"), fetchChecklist("doc-1")]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("asks again once the earlier request has finished, so Try again really retries", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 502));
    fetchMock.mockResolvedValueOnce(jsonResponse({ terms: [], truncated: false }));

    const first = await fetchKeyTerms("doc-1");
    const second = await fetchKeyTerms("doc-1");

    expect(first.ok).toBe(false);
    expect(second.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

const term = (name: string, found: boolean): KeyTerm => ({
  name,
  label: name,
  found,
  value: found ? "x" : null,
  clause_id: found ? "c1" : null,
  page_number: found ? 1 : null,
  quote: found ? "q" : null,
});

describe("splitKeyTerms", () => {
  it("separates found from not mentioned and keeps each group's order", () => {
    const terms = [term("a", false), term("b", true), term("c", true), term("d", false)];

    const { found, notMentioned } = splitKeyTerms(terms);

    expect(found.map((t) => t.name)).toEqual(["b", "c"]);
    expect(notMentioned.map((t) => t.name)).toEqual(["a", "d"]);
  });
});

const answer = (
  id: string,
  status: "answered" | "not_mentioned",
  gap = false,
): ChecklistAnswer => ({
  id,
  question: id,
  why_it_matters: "w",
  importance: gap ? "high" : "medium",
  status,
  answer: status === "answered" ? "a" : null,
  evidence: [],
  gap,
  ask_them: status === "not_mentioned" ? "ask" : null,
});

describe("groupChecklist", () => {
  it("puts gaps first, then answers, then the less important silences", () => {
    const groups = groupChecklist([
      answer("a", "answered"),
      answer("b", "not_mentioned", false),
      answer("c", "not_mentioned", true),
      answer("d", "answered"),
      answer("e", "not_mentioned", true),
    ]);

    expect(groups.gaps.map((x) => x.id)).toEqual(["c", "e"]);
    expect(groups.answered.map((x) => x.id)).toEqual(["a", "d"]);
    expect(groups.otherNotMentioned.map((x) => x.id)).toEqual(["b"]);
  });

  it("puts every answer in exactly one group", () => {
    const all = [
      answer("a", "answered"),
      answer("b", "not_mentioned", false),
      answer("c", "not_mentioned", true),
    ];

    const groups = groupChecklist(all);

    expect(groups.gaps.length + groups.answered.length + groups.otherNotMentioned.length).toBe(3);
  });
});
