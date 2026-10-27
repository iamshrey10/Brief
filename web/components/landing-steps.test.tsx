import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LandingSteps, STEPS } from "./landing-steps";

describe("the how it works section", () => {
  const html = renderToStaticMarkup(<LandingSteps />);

  it("has the id the top bar jumps to, named by its own heading", () => {
    expect(html).toContain('id="how"');
    expect(html).toContain('aria-labelledby="how-heading"');
    expect(html).toContain('id="how-heading"');
  });

  it("is an ordered list, numbered 01 to 03 in order", () => {
    expect(html).toContain("<ol");
    expect(html.match(/>0[1-9]</g)).toEqual([">01<", ">02<", ">03<"]);
  });

  it("shows every step under its own heading", () => {
    for (const step of STEPS) {
      expect(html).toContain(step.title);
      expect(html).toContain(step.body);
    }
    expect(html.match(/<h3/g)).toHaveLength(STEPS.length);
  });

  it("uses no em dash", () => {
    const text = STEPS.map((step) => `${step.title} ${step.body}`).join(" ");

    expect(text).not.toContain("—");
  });
});
