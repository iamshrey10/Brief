import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import NotFound, { metadata } from "./not-found";

describe("the page for an address that does not exist", () => {
  const html = renderToStaticMarkup(<NotFound />);

  it("looks like Brief, says what happened, and offers two ways back", () => {
    expect(html).toContain("Brief");
    expect(html).toContain("That page isn&#x27;t here.");
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('href="/"');
  });

  it("has one heading, a title, and no em dash", () => {
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(metadata.title).toBe("Page not found");
    expect(html).not.toContain("—");
  });
});
