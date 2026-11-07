// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DocumentSummary } from "@/lib/documents";
import type { TrackedDocument } from "@/lib/tracking";

let tracked: TrackedDocument[] = [];
vi.mock("@/components/upload-notifications", () => ({
  useUploadNotifications: () => ({ uploaded: () => {}, tracked, pendingRequests: 0, refreshRequests: () => {} }),
}));

import { DocumentList } from "./document-list";

const doc = (status: string): DocumentSummary => ({ id: "d1", filename: "loan.pdf", doc_type: "loan", status, ocr_confidence: null });

afterEach(() => {
  cleanup();
  tracked = [];
});

describe("a document in the list that has been read but not prepared", () => {
  it("says Preparing, with what is happening, instead of Ready, so the list agrees with the notes", () => {
    tracked = [{ document: doc("ready"), prepared: false }];

    render(<DocumentList documents={[doc("ready")]} />);

    expect(screen.getByText("Preparing")).toBeInTheDocument();
    expect(screen.queryByText("Ready")).not.toBeInTheDocument();
    expect(screen.getByText("Finding the key terms and the questions to ask")).toBeInTheDocument();
  });

  it("says Ready once its summary is prepared", () => {
    tracked = [{ document: doc("ready"), prepared: true }];

    render(<DocumentList documents={[doc("ready")]} />);

    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.queryByText("Preparing")).not.toBeInTheDocument();
  });

  it("says Ready for a document that was not added or followed here", () => {
    render(<DocumentList documents={[doc("ready")]} />);

    expect(screen.getByText("Ready")).toBeInTheDocument();
  });
});
