import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DashboardStats } from "./dashboard-stats";

const render = (stats: Parameters<typeof DashboardStats>[0]["stats"]) => renderToStaticMarkup(<DashboardStats stats={stats} />);

describe("the dashboard numbers", () => {
  it("shows each count under its label", () => {
    const html = render({ total: 6, ready: 4, needsAttention: 1, reading: 1 });

    expect(html).toMatch(/Documents<\/span>[\s\S]*?<span class="font-heading[^>]*>6</);
    expect(html).toMatch(/Ready to open<\/span>[\s\S]*?<span class="font-heading[^>]*>4</);
    expect(html).toMatch(/Being read<\/span>[\s\S]*?<span class="font-heading[^>]*>1</);
    expect(html).toMatch(/Needs attention<\/span>[\s\S]*?<span class="font-heading[^>]*>1</);
  });

  it("tints the needs attention card and points to the documents when something needs fixing", () => {
    const html = render({ total: 2, ready: 1, needsAttention: 1, reading: 0 });

    expect(html).toContain("border-destructive/40");
    expect(html).toContain('href="/dashboard/documents"');
    expect(html).toContain("Could not be read well");
  });

  it("is calm, with no tint and no link, when nothing needs fixing", () => {
    const html = render({ total: 2, ready: 2, needsAttention: 0, reading: 0 });

    expect(html).not.toContain("border-destructive");
    expect(html).not.toContain('href="/dashboard/documents"');
    expect(html).toContain("Nothing to fix");
  });

  it("says there are none yet, instead of a bare zero, for a new account", () => {
    expect(render({ total: 0, ready: 0, needsAttention: 0, reading: 0 })).toContain("None yet");
  });

  it("is named as a section for a screen reader", () => {
    expect(render({ total: 0, ready: 0, needsAttention: 0, reading: 0 })).toContain('aria-label="Your documents at a glance"');
  });

  it("gives each card an icon that a screen reader skips", () => {
    const html = render({ total: 1, ready: 1, needsAttention: 0, reading: 0 });

    expect(html.match(/<svg/g)).toHaveLength(4);
    expect(html.match(/<span aria-hidden="true"/g)).toHaveLength(4);
  });

  it("turns the being read icon only while something is being read, and never for a reader who prefers less motion", () => {
    expect(render({ total: 1, ready: 0, needsAttention: 0, reading: 1 })).toContain("motion-safe:animate-spin");
    expect(render({ total: 1, ready: 1, needsAttention: 0, reading: 0 })).not.toContain("animate-spin");
    expect(render({ total: 1, ready: 0, needsAttention: 0, reading: 1 })).not.toMatch(/(^|[ "])animate-spin/);
  });

  it("lifts a card a little on hover, and not at all for a reader who prefers less motion", () => {
    const html = render({ total: 1, ready: 1, needsAttention: 0, reading: 0 });

    expect(html).toContain("hover:-translate-y-0.5");
    expect(html).toContain("motion-reduce:hover:translate-y-0");
  });
});
