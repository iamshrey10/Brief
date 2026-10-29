import { describe, expect, it } from "vitest";

import { initialOf } from "./profile";

describe("initialOf", () => {
  it("is the first letter of the address, in capitals", () => {
    expect(initialOf("ada@example.com")).toBe("A");
  });

  it("ignores spaces before the address", () => {
    expect(initialOf("  ada@example.com")).toBe("A");
  });

  it("is a question mark when there is no address", () => {
    expect(initialOf("")).toBe("?");
    expect(initialOf("   ")).toBe("?");
  });
});
