// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AddDocumentsCard } from "./add-documents-card";

afterEach(cleanup);

describe("the dashboard add documents card", () => {
  it("shows a heading, one supporting line and one way to add documents", () => {
    const { container } = render(<AddDocumentsCard />);

    expect(screen.getByRole("heading", { name: "Add your documents" })).toBeInTheDocument();
    expect(screen.getByText("Your documents, securely managed in one place.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Add documents" })).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("sends the person to the Documents page, and uploads nothing itself", () => {
    const { container } = render(<AddDocumentsCard />);

    expect(screen.getByRole("link", { name: "Add documents" })).toHaveAttribute("href", "/dashboard/documents");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
  });

  it("keeps the polished look: a tinted gradient card and a raised icon tile, hidden from a screen reader", () => {
    const { container } = render(<AddDocumentsCard />);

    expect(container.querySelector("section")?.className).toContain("bg-gradient-to-br");
    const tile = container.querySelector('span[aria-hidden="true"]');
    expect(tile?.className).toContain("bg-primary");
    expect(tile?.className).toContain("shadow-md");
  });
});
