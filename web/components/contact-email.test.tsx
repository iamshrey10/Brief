// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ContactEmail } from "./contact-email";

afterEach(cleanup);

describe("ContactEmail", () => {
  it("becomes a tap-to-email link to the contact address once the page is in the browser", async () => {
    render(<ContactEmail className="x" />);

    const link = await screen.findByRole("link", { name: "revankarshreyas10@gmail.com" });
    expect(link).toHaveAttribute("href", "mailto:revankarshreyas10@gmail.com");
    expect(link).toHaveClass("x");
  });
});
