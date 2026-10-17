import { describe, expect, it } from "vitest";

import { referenceFrom, withReference } from "./reference";

const answer = (id: string | null) =>
  new Response("{}", { status: 502, headers: id === null ? {} : { "X-Request-ID": id } });

describe("referenceFrom", () => {
  it("is the first eight characters of the id the server sent, which also start that request's log lines", () => {
    expect(referenceFrom(answer("3f2b8c1e-9d4a-4e07-8a55-0c1d2e3f4a5b"))).toBe("3f2b8c1e");
  });

  it("works for an id the API made itself, which has no dashes", () => {
    expect(referenceFrom(answer("0123456789abcdef0123456789abcdef"))).toBe("01234567");
  });

  it("is nothing when the server sent no id", () => {
    expect(referenceFrom(answer(null))).toBeUndefined();
  });

  it.each(["", "short", "has spaces in it 1234", "<script>alert(1)</script>", "a".repeat(65)])(
    "is nothing for an id that does not look like one (%j), so odd text is never shown to a person",
    (odd) => {
      expect(referenceFrom(answer(odd))).toBeUndefined();
    },
  );
});

describe("referenceFrom with a response that has no headers", () => {
  it("is nothing instead of failing", () => {
    expect(referenceFrom({ headers: undefined })).toBeUndefined();
  });

  it("still reads the id from anything that has headers", () => {
    expect(referenceFrom({ headers: new Headers({ "X-Request-ID": "3f2b8c1e-9d4a-4e07" }) })).toBe(
      "3f2b8c1e",
    );
  });
});

describe("withReference", () => {
  it("adds the reference after the message", () => {
    expect(withReference("I couldn't do that just now.", "3f2b8c1e")).toBe(
      "I couldn't do that just now. Reference: 3f2b8c1e",
    );
  });

  it("leaves the message alone when there is no reference", () => {
    expect(withReference("I couldn't do that just now.", undefined)).toBe("I couldn't do that just now.");
  });
});
