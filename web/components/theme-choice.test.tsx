// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const setTheme = vi.fn();
let theme: string | undefined = "dark";
vi.mock("next-themes", () => ({ useTheme: () => ({ theme, setTheme }) }));

import { ThemeChoice } from "./theme-choice";

afterEach(() => {
  cleanup();
  setTheme.mockReset();
  theme = "dark";
});

describe("the appearance choice", () => {
  it("offers Light, Dark and System as one group of choices, with the saved one marked", () => {
    render(<ThemeChoice />);

    const group = screen.getByRole("radiogroup", { name: "Appearance" });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole("radio").map((radio) => radio.textContent)).toEqual([
      "Light",
      "Dark",
      "SystemFollows your computer",
    ]);
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "false");
  });

  it("saves the choice that is clicked", () => {
    render(<ThemeChoice />);

    fireEvent.click(screen.getByRole("radio", { name: /System/ }));

    expect(setTheme).toHaveBeenCalledWith("system");
  });

  it("marks System when nothing was ever chosen", () => {
    theme = undefined;
    render(<ThemeChoice />);

    expect(screen.getByRole("radio", { name: /System/ })).toHaveAttribute("aria-checked", "true");
  });
});
