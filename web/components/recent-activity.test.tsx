import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Activity } from "@/lib/dashboard";
import { RecentActivity } from "./recent-activity";

const item = (over: Partial<Activity> = {}): Activity => ({ id: "d1", filename: "maple-lease.pdf", what: "Ready to open", when: "2 hours ago", openable: true, ...over });

describe("the recent activity list", () => {
  it("shows each document with what it is like now and how long ago", () => {
    const html = renderToStaticMarkup(<RecentActivity items={[item(), item({ id: "d2", filename: "loan.pdf", what: "Could not be read", when: "yesterday", openable: false })]} />);

    expect(html).toContain("maple-lease.pdf");
    expect(html).toContain("Ready to open");
    expect(html).toContain("2 hours ago");
    expect(html).toContain("Could not be read");
    expect(html).toContain("yesterday");
  });

  it("links a document with text to its page, and leaves one that has none as plain text", () => {
    const html = renderToStaticMarkup(<RecentActivity items={[item(), item({ id: "d2", openable: false })]} />);

    expect(html).toContain('href="/dashboard/documents/d1"');
    expect(html).not.toContain('href="/dashboard/documents/d2"');
  });

  it("is named by its heading, and shows nothing when there is no activity", () => {
    expect(renderToStaticMarkup(<RecentActivity items={[item()]} />)).toContain('aria-labelledby="activity-heading"');
    expect(renderToStaticMarkup(<RecentActivity items={[]} />)).toBe("");
  });
});
