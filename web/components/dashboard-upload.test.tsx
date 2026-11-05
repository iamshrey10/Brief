// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/components/upload-panel", () => ({
  UploadPanel: ({ onUploaded }: { onUploaded: (document: { filename: string }) => void }) => (
    <button type="button" onClick={() => onUploaded({ filename: "maple-lease.pdf" })}>
      finish an upload
    </button>
  ),
}));

import { DashboardUpload } from "./dashboard-upload";

beforeEach(() => refresh.mockReset());
afterEach(cleanup);

describe("the dashboard add documents card", () => {
  it("shows a heading, one line about it, one button and what is accepted", () => {
    const { container } = render(<DashboardUpload />);

    expect(screen.getByRole("heading", { name: "Add your documents" })).toBeInTheDocument();
    expect(screen.getByText("Upload a loan, lease, or job offer to get started.")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Add documents" })).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "About uploads" });
    expect(list).toHaveTextContent("PDF, JPG, PNG, or HEIC");
    expect(list).toHaveTextContent("Up to 50 MB per file");
    expect(list).toHaveTextContent("Secure and private");
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("has the polished look: a tinted gradient card, a dashed drop area and a raised icon tile, hidden from a screen reader", () => {
    const { container } = render(<DashboardUpload />);

    expect(container.querySelector("section")?.className).toContain("bg-gradient-to-br");
    const tile = container.querySelector('span[aria-hidden="true"]');
    expect(tile?.className).toContain("bg-primary");
    expect(tile?.className).toContain("shadow-md");
    expect(container.querySelector(".border-dashed")).not.toBeNull();
  });

  it("is a section named Add documents", () => {
    render(<DashboardUpload />);

    expect(screen.getByRole("region", { name: "Add documents" })).toBeInTheDocument();
  });

  it("opens the form in place when the button is pressed, and the button gives way to it", () => {
    render(<DashboardUpload />);
    const button = screen.getByRole("button", { name: "Add documents" });
    expect(button).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(button);

    expect(screen.getByRole("button", { name: "finish an upload" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add documents" })).not.toBeInTheDocument();
  });

  it("puts the form away again with Cancel, uploading nothing", () => {
    render(<DashboardUpload />);
    fireEvent.click(screen.getByRole("button", { name: "Add documents" }));

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Add documents" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "finish an upload" })).not.toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("says which document was added with a way to Documents, closes the form, and refreshes the page's numbers", () => {
    render(<DashboardUpload />);
    fireEvent.click(screen.getByRole("button", { name: "Add documents" }));

    fireEvent.click(screen.getByRole("button", { name: "finish an upload" }));

    expect(screen.getByRole("status")).toHaveTextContent("maple-lease.pdf was added.");
    expect(screen.getByRole("link", { name: "Open Documents" })).toHaveAttribute("href", "/dashboard/documents");
    expect(screen.queryByRole("button", { name: "finish an upload" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add documents" })).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows no message before anything is added", () => {
    render(<DashboardUpload />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
