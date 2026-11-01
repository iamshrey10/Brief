import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Rise } from "./rise";

const html = (order?: number) => renderToStaticMarkup(<Rise order={order}>content</Rise>);

describe("the rise entrance", () => {
  it("wraps its content in a part that fades and slides up, only for a reader who accepts motion", () => {
    const out = html(2);

    expect(out).toContain("content");
    expect(out).toContain("motion-safe:animate-in");
    expect(out).toContain("motion-safe:fade-in");
    expect(out).toContain("motion-safe:slide-in-from-bottom-3");
    expect(out).not.toMatch(/(^|[ "])animate-in/);
  });

  it("holds each later part back a little longer, so they come one after another", () => {
    expect(html(1)).toContain("animation-delay:70ms");
    expect(html(3)).toContain("animation-delay:210ms");
  });

  it("starts the first part at once, with no delay", () => {
    expect(html(0)).not.toContain("animation-delay");
    expect(html()).not.toContain("animation-delay");
  });

  it("never holds a part back for more than eight steps, or for a negative number", () => {
    expect(html(30)).toContain("animation-delay:560ms");
    expect(html(-4)).not.toContain("animation-delay");
  });

  it("keeps the part unseen only until it starts, and keeps a class from outside", () => {
    expect(html(1)).toContain("motion-safe:fill-mode-backwards");
    expect(renderToStaticMarkup(<Rise className="mt-4">x</Rise>)).toContain("mt-4");
  });
});
