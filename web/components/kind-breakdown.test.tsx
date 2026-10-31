import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { KindBreakdown } from "./kind-breakdown";

const docs = (...kinds: string[]) => kinds.map((doc_type) => ({ doc_type }));

describe("the by kind breakdown", () => {
  it("shows each kind present with its count, in the usual order", () => {
    const html = renderToStaticMarkup(<KindBreakdown documents={docs("lease", "lease", "loan", "lease", "other")} />);

    expect(html.indexOf("Education loan")).toBeLessThan(html.indexOf("Lease"));
    expect(html).toMatch(/Lease<\/span><span[^>]*>3</);
    expect(html).toMatch(/Education loan<\/span><span[^>]*>1</);
    expect(html).not.toContain("Job offer");
  });

  it("sizes each bar to its share of the largest, with a visible minimum, and hides the bars from a screen reader", () => {
    const html = renderToStaticMarkup(<KindBreakdown documents={docs("lease", "lease", "lease", "lease", "other")} />);

    expect(html).toContain("width:100%");
    expect(html).toContain("width:25%");
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(2);
    expect(renderToStaticMarkup(<KindBreakdown documents={docs("lease", "lease", "lease", "lease", "lease", "lease", "lease", "lease", "lease", "lease", "loan")} />)).toContain("width:10%");
    expect(renderToStaticMarkup(<KindBreakdown documents={docs(...Array(30).fill("lease"), "loan")} />)).toContain("width:8%");
  });

  it("is named by its heading, and shows nothing for no documents", () => {
    expect(renderToStaticMarkup(<KindBreakdown documents={docs("lease")} />)).toContain('aria-labelledby="kinds-heading"');
    expect(renderToStaticMarkup(<KindBreakdown documents={[]} />)).toBe("");
  });
});
