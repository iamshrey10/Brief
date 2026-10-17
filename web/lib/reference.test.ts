import { describe, expect, it } from "vitest";

import { referenceFrom } from "./reference";

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
