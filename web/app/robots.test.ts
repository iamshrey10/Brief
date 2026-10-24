import { describe, expect, it } from "vitest";

import robots from "./robots";

describe("robots.txt", () => {
  it("lets search engines read the landing page", () => {
    expect(robots().rules).toMatchObject({ userAgent: "*", allow: "/" });
  });

  it("keeps them out of everything behind sign in and out of the website's API routes", () => {
    expect((robots().rules as { disallow: string[] }).disallow).toEqual(["/dashboard", "/api/"]);
  });
});
