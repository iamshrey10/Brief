// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PrintButton } from "./print-button";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the print button", () => {
  it("opens the browser's print dialog", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<PrintButton />);

    fireEvent.click(screen.getByRole("button", { name: "Print or save as PDF" }));

    expect(print).toHaveBeenCalledTimes(1);
  });

  it("is left off the printed page itself", () => {
    render(<PrintButton />);

    expect(screen.getByRole("button", { name: "Print or save as PDF" })).toHaveClass("print:hidden");
  });
});
