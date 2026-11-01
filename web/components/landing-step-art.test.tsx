import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StepArt } from "./landing-step-art";

describe("the How it works scenes", () => {
  const first = renderToStaticMarkup(<StepArt index={0} />);

  it("draws the add a document scene for the first step: a file, a tray, a bar and a check", () => {
    expect(first).toContain("hiw-s1");
    expect(first).toContain("hiw-drop");
    expect(first).toContain("hiw-fill");
    expect(first).toContain("hiw-pop");
    expect(first).toContain("<svg");
  });

  it("is decoration with no words, which a screen reader skips", () => {
    expect(first).toContain('aria-hidden="true"');
    expect(first.replace(/<[^>]*>/g, "")).toBe("");
  });

  it("draws nothing for a step that has no scene", () => {
    expect(renderToStaticMarkup(<StepArt index={7} />)).toBe("");
  });
});
