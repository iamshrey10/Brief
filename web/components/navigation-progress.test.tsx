// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/dashboard";
let search = "";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
}));

import { NavigationProgress } from "./navigation-progress";

const bar = () => document.querySelector("[data-nav-progress]");

function link(href: string, attrs: Record<string, string> = {}) {
  const a = document.createElement("a");
  a.href = href;
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  a.textContent = "go";
  document.body.appendChild(a);
  return a;
}

beforeEach(() => {
  pathname = "/dashboard";
  search = "";
  window.history.replaceState(null, "", "/dashboard");
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("NavigationProgress", () => {
  it("shows nothing until a link is pressed", () => {
    render(<NavigationProgress />);

    expect(bar()).toBeNull();
  });

  it("starts the moment a link to another page of the site is pressed, and goes when that page has come", () => {
    const { rerender } = render(<NavigationProgress />);

    fireEvent.click(link("/dashboard/documents"));
    expect(bar()).not.toBeNull();

    pathname = "/dashboard/documents";
    window.history.replaceState(null, "", "/dashboard/documents");
    rerender(<NavigationProgress />);
    expect(bar()).toBeNull();
  });

  it("does nothing for a link that leaves the site, opens a new tab, downloads, or only moves within the page", () => {
    render(<NavigationProgress />);

    fireEvent.click(link("https://example.com/"));
    fireEvent.click(link("/dashboard/documents", { target: "_blank" }));
    fireEvent.click(link("/file.pdf", { download: "" }));
    fireEvent.click(link("/dashboard#bin"));
    fireEvent.click(link("/dashboard"));

    expect(bar()).toBeNull();
  });

  it("does nothing when a modifier key is held, which opens the link elsewhere", () => {
    render(<NavigationProgress />);

    fireEvent.click(link("/dashboard/shared"), { metaKey: true });
    fireEvent.click(link("/dashboard/shared"), { ctrlKey: true });
    fireEvent.click(link("/dashboard/shared"), { shiftKey: true });

    expect(bar()).toBeNull();
  });

  it("is taken away if the page never arrives", () => {
    render(<NavigationProgress />);
    fireEvent.click(link("/dashboard/shared"));
    expect(bar()).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(15_001);
    });

    expect(bar()).toBeNull();
  });

  it("is hidden from screen readers and takes no clicks", () => {
    render(<NavigationProgress />);
    fireEvent.click(link("/dashboard/shared"));

    expect(bar()).toHaveAttribute("aria-hidden", "true");
    expect(bar()?.className).toContain("pointer-events-none");
  });
});
