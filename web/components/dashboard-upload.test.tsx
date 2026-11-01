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

describe("the dashboard upload card", () => {
  it("has the form open for a person with no documents, and no button to open it", () => {
    render(<DashboardUpload hasDocuments={false} />);

    expect(screen.getByRole("button", { name: "finish an upload" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add a document" })).not.toBeInTheDocument();
  });

  it("is one short bar with one button for a person who has documents, and the button opens the form", () => {
    render(<DashboardUpload hasDocuments />);

    expect(screen.queryByRole("button", { name: "finish an upload" })).not.toBeInTheDocument();
    const open = screen.getByRole("button", { name: "Add a document" });
    expect(open).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(open);

    expect(screen.getByRole("button", { name: "finish an upload" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add a document" })).not.toBeInTheDocument();
  });

  it("is a section named by its heading, which says what to add and in what form", () => {
    render(<DashboardUpload hasDocuments />);

    expect(screen.getByRole("region", { name: "Add a document" })).toBeInTheDocument();
    expect(screen.getByText(/as a PDF or a photo/)).toBeInTheDocument();
  });

  it("says which document was added, what happens next and where to follow it, and refreshes the page's numbers", () => {
    render(<DashboardUpload hasDocuments={false} />);

    fireEvent.click(screen.getByRole("button", { name: "finish an upload" }));

    const message = screen.getByRole("status");
    expect(message).toHaveTextContent("maple-lease.pdf was added and Brief is reading it now.");
    expect(screen.getByRole("link", { name: "Open Documents" })).toHaveAttribute("href", "/dashboard/documents");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows no message before anything is added", () => {
    render(<DashboardUpload hasDocuments={false} />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
