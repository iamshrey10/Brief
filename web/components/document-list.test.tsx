// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { DocumentSummary } from "@/lib/documents";
import { DocumentList } from "./document-list";

function doc(status: string, id = "d1", filename = "loan.pdf"): DocumentSummary {
  return { id, filename, doc_type: "loan", status, ocr_confidence: null };
}

afterEach(cleanup);

describe("DocumentList", () => {
  it("shows nothing at all when there are no documents", () => {
    const { container } = render(<DocumentList documents={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("links a ready document to its page", () => {
    render(<DocumentList documents={[doc("ready", "abc-123")]} />);

    expect(screen.getByRole("link", { name: /loan\.pdf/ })).toHaveAttribute(
      "href",
      "/dashboard/documents/abc-123",
    );
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("also links a hard-to-read scan, since it still has text to read", () => {
    render(<DocumentList documents={[doc("needs_retake", "scan-1", "photo.png")]} />);

    expect(screen.getByRole("link", { name: /photo\.png/ })).toHaveAttribute(
      "href",
      "/dashboard/documents/scan-1",
    );
    expect(screen.getByText("Hard to read")).toBeInTheDocument();
  });

  it.each(["pending", "uploaded", "processing", "failed"])(
    "does not link a %s document, there is nothing to open yet",
    (status) => {
      render(<DocumentList documents={[doc(status)]} />);

      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.getByText("loan.pdf")).toBeInTheDocument();
    },
  );

  it("uses plain-language status labels, never the raw status", () => {
    render(
      <DocumentList
        documents={[
          doc("processing", "a", "one.pdf"),
          doc("failed", "b", "two.pdf"),
          doc("needs_retake", "c", "three.png"),
        ]}
      />,
    );

    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(screen.getByText("Couldn't read")).toBeInTheDocument();
    expect(screen.getByText("Hard to read")).toBeInTheDocument();
    expect(screen.queryByText("needs_retake")).not.toBeInTheDocument();
  });

  it("lists documents in the order it was given", () => {
    render(
      <DocumentList
        documents={[doc("ready", "a", "newest.pdf"), doc("ready", "b", "oldest.pdf")]}
      />,
    );

    const names = screen.getAllByRole("link").map((link) => link.textContent ?? "");
    expect(names[0]).toContain("newest.pdf");
    expect(names[1]).toContain("oldest.pdf");
  });
});
