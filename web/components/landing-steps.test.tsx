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

  it("is complete and visible as the server sends it, with nothing waiting for a scroll", () => {
    expect(html).toContain('data-reveal="idle"');
    for (const step of STEPS) {
      expect(html).toContain(step.title);
      expect(html).toContain(step.body);
    }
  });

  it("gives each card its place in the order they come in, a line that draws across and a number that settles in", () => {
    expect(html.match(/hiw-card/g)).toHaveLength(STEPS.length);
    expect(html.match(/hiw-rule/g)).toHaveLength(STEPS.length);
    expect(html.match(/hiw-number/g)).toHaveLength(STEPS.length);
    expect(html).toContain("--i:0");
    expect(html).toContain("--i:1");
    expect(html).toContain("--i:2");
  });

  it("hides the drawn lines from a screen reader, since they carry no meaning", () => {
    expect(html.match(/<span aria-hidden="true" class="hiw-rule/g)).toHaveLength(STEPS.length);
  });
});
