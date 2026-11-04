import { afterEach, describe, expect, it, vi } from "vitest";

import { badgeLetter, needsName, personLabel, splitName } from "./profile";
import { messageForNameFailure, saveName } from "./name";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

describe("names", () => {
  it.each([
    ["Maya Rao", { first: "Maya", last: "Rao" }],
    ["  Maya   van der Rao ", { first: "Maya", last: "van der Rao" }],
    ["Maya", { first: "Maya", last: "" }],
    ["", { first: "", last: "" }],
    [null, { first: "", last: "" }],
  ])("splits %j for the form", (full, expected) => expect(splitName(full)).toEqual(expected));

  it("asks for a name only when the backend clearly says there is none", () => {
    expect(needsName({ id: "u", email: "a@x.com", first_name: null })).toBe(true);
    expect(needsName({ id: "u", email: "a@x.com" })).toBe(true);
    expect(needsName({ id: "u", first_name: "" })).toBe(true);
    expect(needsName({ id: "u", first_name: "Sam" })).toBe(false);
    expect(needsName(null)).toBe(false);
    expect(needsName([])).toBe(false);
    expect(needsName({ detail: "x" })).toBe(false);
  });

  it("names a person by their name, else their address", () => {
    expect(personLabel("Maya Rao", "m@x.com")).toBe("Maya Rao");
    expect(personLabel("  ", "m@x.com")).toBe("m@x.com");
    expect(personLabel(null, "m@x.com")).toBe("m@x.com");
    expect(badgeLetter("maya rao", "z@x.com")).toBe("M");
    expect(badgeLetter("", "z@x.com")).toBe("Z");
  });

  it.each([
    [401, "session expired"],
    [422, "letters, spaces"],
    [429, "Too many requests"],
    [500, "Try again in a moment"],
  ])("a %i says %s", (status, text) => expect(messageForNameFailure(status)).toContain(text));
});

describe("saving a name", () => {
  it("sends the trimmed names and returns what was saved", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ first_name: "Maya", last_name: "Rao" }), { status: 200 }));

    expect(await saveName(" Maya ", " Rao ")).toEqual({ ok: true, result: { first_name: "Maya", last_name: "Rao" } });
    expect(fetchMock).toHaveBeenCalledWith("/api/backend/me", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ first_name: "Maya", last_name: "Rao" }) }));
  });

  it("explains a refusal, with the reference", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 422, headers: { "X-Request-ID": "abcdef12-3456" } }));

    const outcome = await saveName("1", "2");

    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.message).toContain("letters, spaces");
    expect(!outcome.ok && outcome.message).toContain("Reference: abcdef12");
  });

  it("says it could not save, rather than throwing, when the server cannot be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    expect(await saveName("a", "b")).toEqual({ ok: false, message: messageForNameFailure(0) });
  });
});
