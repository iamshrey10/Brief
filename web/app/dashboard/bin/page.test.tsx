import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));

import BinPage from "./page";

describe("the old Bin address", () => {
  it("sends the visitor to the Bin inside the Profile section", () => {
    expect(() => BinPage()).toThrow("NEXT_REDIRECT:/dashboard/profile#bin");
  });
});
