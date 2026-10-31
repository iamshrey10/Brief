import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { UsageCard } from "./usage-card";

const usage = {
  ask: { used: 25, limit: 100, left: 75 },
  read: { used: 30, limit: 30, left: 0 },
  analyze: { used: 0, limit: 60, left: 60 },
};

describe("the today's limits card", () => {
  const html = renderToStaticMarkup(<UsageCard usage={usage} />);

  it("is named by its heading and says when the limits reset", () => {
    expect(html).toContain('aria-labelledby="usage-heading"');
    expect(html).toContain("Today&#x27;s limits");
    expect(html).toContain("Resets at midnight UTC");
  });

  it("shows each limit with what is used, what the limit is and what is left", () => {
    expect(html).toContain("Questions");
    expect(html).toContain("25 of 100 used");
    expect(html).toContain("75 left today");
    expect(html).toContain("Overviews");
    expect(html).toContain("60 left today");
  });

  it("gives each bar a name and its numbers for a screen reader", () => {
    expect(html.match(/role="progressbar"/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Document reads used today"');
    expect(html).toContain('aria-valuenow="30"');
    expect(html).toContain('aria-valuemax="100"');
  });

  it("fills each bar to its share, and shows a limit that is used up in the error color with words, not color alone", () => {
    expect(html).toContain("width:25%");
    expect(html).toContain("width:100%");
    expect(html).toContain("bg-destructive");
    expect(html).toContain("None left today");
  });

  it("says the numbers are not available, and shows no bars, when there are none", () => {
    const missing = renderToStaticMarkup(<UsageCard usage={null} />);

    expect(missing).toContain("Your usage is not available right now");
    expect(missing).not.toContain("progressbar");
  });

  it("says under each limit what uses it up, since a name such as Overviews does not", () => {
    expect(html).toContain("Each question you ask in the Ask tab.");
    expect(html).toContain("Each upload, Try again or Read again.");
    expect(html).toContain("Opening them again is free.");
  });
});
