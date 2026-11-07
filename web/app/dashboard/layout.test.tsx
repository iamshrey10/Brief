import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import DashboardLayout from "./layout";

describe("the signed in layout", () => {
  it("shows the page and has a place for notes about documents, wherever the person is", () => {
    const html = renderToStaticMarkup(<DashboardLayout params={Promise.resolve({})}>{<p>the page</p>}</DashboardLayout>);

    expect(html).toContain("the page");
    expect(html).toContain('aria-label="Notifications"');
  });
});
