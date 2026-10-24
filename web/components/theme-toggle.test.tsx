// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const setTheme = vi.fn();
let resolvedTheme: string | undefined = "dark";
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme, setTheme }),
}));

import { ThemeToggle } from "./theme-toggle";

afterEach(() => {
  cleanup();
  setTheme.mockReset();
  resolvedTheme = "dark";
});

describe("ThemeToggle", () => {
  it("offers light mode while the page is dark, and switches to light when clicked", async () => {
    render(<ThemeToggle />);

    await userEvent.click(screen.getByRole("button", { name: "Light mode" }));

    expect(setTheme).toHaveBeenCalledExactlyOnceWith("light");
  });

  it("offers dark mode while the page is light, and switches to dark when clicked", async () => {
    resolvedTheme = "light";
    render(<ThemeToggle />);

    await userEvent.click(screen.getByRole("button", { name: "Dark mode" }));

    expect(setTheme).toHaveBeenCalledExactlyOnceWith("dark");
  });
});

describe("ThemeToggle before the browser has taken over", () => {
  it("renders an empty space of the same size and no button, so the page does not jump or show the wrong label", () => {
    const html = renderToStaticMarkup(<ThemeToggle />);

    expect(html).toContain("h-9 w-24");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Light mode");
    expect(html).not.toContain("Dark mode");
  });
});
