// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocumentSummary } from "@/lib/documents";
import { retryDocument } from "@/lib/retry";
import { DocumentList } from "./document-list";

vi.mock("@/lib/retry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/retry")>();
  return { ...actual, retryDocument: vi.fn() };
});

const retryMock = vi.mocked(retryDocument);

function doc(
  status: string,
  id = "d1",
  filename = "loan.pdf",
  extra: Partial<DocumentSummary> = {},
): DocumentSummary {
  return { id, filename, doc_type: "loan", status, ocr_confidence: null, ...extra };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DocumentList", () => {
  it("explains what to do when there are no documents yet, instead of showing nothing", () => {
    render(<DocumentList documents={[]} />);

    expect(screen.getByText("No documents yet")).toBeInTheDocument();
    expect(screen.getByText(/upload a loan, lease, or job offer/i)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
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

  it("tells apart two copies of the same file by when each was uploaded", () => {
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12);
    render(
      <DocumentList
        documents={[
          doc("ready", "a", "Deposit Agreement.pdf", { created_at: now.toISOString() }),
          doc("ready", "b", "Deposit Agreement.pdf", { created_at: yesterday.toISOString() }),
        ]}
      />,
    );

    const [first, second] = screen.getAllByRole("link");
    expect(first).toHaveTextContent("Uploaded today");
    expect(second).toHaveTextContent("Uploaded yesterday");
  });

  it("shows the kind of document next to when it was uploaded", () => {
    render(
      <DocumentList
        documents={[doc("ready", "a", "lease.pdf", { doc_type: "lease", created_at: new Date().toISOString() })]}
      />,
    );

    expect(screen.getByRole("link")).toHaveTextContent("Lease · Uploaded today");
  });

  it("leaves the date out when the server did not send one", () => {
    render(<DocumentList documents={[doc("ready", "a", "loan.pdf")]} />);

    expect(screen.getByRole("link")).not.toHaveTextContent("Uploaded");
    expect(screen.getByRole("link")).toHaveTextContent("Education loan");
  });

  it("falls back to a plain document icon and the raw type for a type it does not know", () => {
    render(<DocumentList documents={[doc("ready", "a", "mystery.pdf", { doc_type: "something-new" })]} />);

    expect(screen.getByRole("link")).toHaveTextContent("something-new");
  });

  it("marks a document that is still being read as working, and one that cannot be read as an error", () => {
    render(
      <DocumentList documents={[doc("processing", "a", "one.pdf"), doc("failed", "b", "two.pdf")]} />,
    );

    const [working, broken] = screen.getAllByRole("listitem");
    expect(within(working).getByText("Processing")).toBeInTheDocument();
    expect(within(broken).getByText("Couldn't read")).toBeInTheDocument();
  });

  it("only offers the open arrow on documents that can be opened", () => {
    const { container } = render(
      <DocumentList documents={[doc("ready", "a", "one.pdf"), doc("processing", "b", "two.pdf")]} />,
    );

    const [openable, notYet] = container.querySelectorAll("li");
    expect(openable.querySelector("svg.lucide-chevron-right")).not.toBeNull();
    expect(notYet.querySelector("svg.lucide-chevron-right")).toBeNull();
  });

  it("keeps long file names from pushing the status off the row", () => {
    render(<DocumentList documents={[doc("ready", "a", "a-very-long-file-name.pdf".repeat(10))]} />);

    expect(screen.getByText(/a-very-long-file-name\.pdf/)).toHaveClass("truncate");
  });

  it.each([
    ["loan", "lucide-landmark"],
    ["lease", "lucide-house"],
    ["offer", "lucide-briefcase"],
    ["other", "lucide-file-text"],
  ])("gives a %s document its own icon (%s)", (docType, iconClass) => {
    const { container } = render(
      <DocumentList documents={[doc("ready", "a", "x.pdf", { doc_type: docType })]} />,
    );

    expect(container.querySelector(`li svg.${iconClass}`)).not.toBeNull();
  });

  it.each([
    ["ready", "lucide-circle-check", "text-primary"],
    ["processing", "lucide-loader-circle", "text-muted-foreground"],
    ["uploaded", "lucide-loader-circle", "text-muted-foreground"],
    ["pending", "lucide-loader-circle", "text-muted-foreground"],
    ["needs_retake", "lucide-triangle-alert", "text-amber-900"],
    ["failed", "lucide-circle-x", "text-destructive"],
  ])("shows a %s document with the %s badge in its own colour", (status, iconClass, colourClass) => {
    const { container } = render(<DocumentList documents={[doc(status)]} />);

    const badge = container.querySelector(`li svg.${iconClass}`)?.parentElement;
    expect(badge).not.toBeNull();
    expect(badge).toHaveClass(colourClass);
  });

  it("only spins the badge for work that is still going on", () => {
    const { container } = render(
      <DocumentList documents={[doc("processing", "a"), doc("ready", "b"), doc("failed", "c")]} />,
    );

    const spinning = container.querySelectorAll("svg.motion-safe\\:animate-spin");
    expect(spinning).toHaveLength(1);
  });

  describe("trying again", () => {
    const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

    it("offers Try again on a document that failed", () => {
      render(<DocumentList documents={[doc("failed", "a", "broken.pdf")]} />);

      expect(screen.getByRole("button", { name: "Try reading broken.pdf again" })).toHaveTextContent(
        "Try again",
      );
    });

    it("offers Try again on a document stuck being read for a long time", () => {
      render(
        <DocumentList documents={[doc("processing", "a", "stuck.pdf", { created_at: minutesAgo(60) })]} />,
      );

      expect(screen.getByRole("button", { name: "Try reading stuck.pdf again" })).toBeInTheDocument();
    });

    it.each(["ready", "needs_retake"])("does not offer it on a %s document", (status) => {
      render(<DocumentList documents={[doc(status)]} />);

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("does not offer it on a document that was only just uploaded", () => {
      render(
        <DocumentList documents={[doc("processing", "a", "new.pdf", { created_at: minutesAgo(1) })]} />,
      );

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("asks for that document to be read again and hands back the updated one", async () => {
      const updated = doc("uploaded", "a", "broken.pdf");
      retryMock.mockResolvedValue({ ok: true, document: updated });
      const onRetried = vi.fn();
      const user = userEvent.setup();
      render(<DocumentList documents={[doc("failed", "a", "broken.pdf")]} onRetried={onRetried} />);

      await user.click(screen.getByRole("button", { name: "Try reading broken.pdf again" }));

      expect(retryMock).toHaveBeenCalledWith("a");
      await waitFor(() => expect(onRetried).toHaveBeenCalledWith(updated));
    });

    it("shows progress and cannot be pressed twice while the request is running", async () => {
      retryMock.mockReturnValue(new Promise(() => {}));
      const user = userEvent.setup();
      render(<DocumentList documents={[doc("failed", "a", "broken.pdf")]} />);

      await user.click(screen.getByRole("button", { name: "Try reading broken.pdf again" }));

      const button = screen.getByRole("button", { name: "Try reading broken.pdf again" });
      expect(button).toHaveTextContent("Starting...");
      expect(button).toBeDisabled();
      expect(retryMock).toHaveBeenCalledTimes(1);
    });

    it("says what went wrong on that row and lets it be tried again", async () => {
      retryMock.mockResolvedValueOnce({ ok: false, message: "Couldn't start that just now." });
      const user = userEvent.setup();
      render(
        <DocumentList documents={[doc("failed", "a", "one.pdf"), doc("failed", "b", "two.pdf")]} />,
      );

      await user.click(screen.getByRole("button", { name: "Try reading one.pdf again" }));

      const [first, second] = screen.getAllByRole("listitem");
      expect(await within(first).findByRole("alert")).toHaveTextContent("Couldn't start that just now.");
      expect(within(second).queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Try reading one.pdf again" })).toBeEnabled();
    });

    it("clears an earlier error when it is tried again", async () => {
      retryMock.mockResolvedValueOnce({ ok: false, message: "Couldn't start that just now." });
      retryMock.mockReturnValueOnce(new Promise(() => {}));
      const user = userEvent.setup();
      render(<DocumentList documents={[doc("failed", "a", "one.pdf")]} />);

      await user.click(screen.getByRole("button", { name: "Try reading one.pdf again" }));
      await screen.findByRole("alert");
      await user.click(screen.getByRole("button", { name: "Try reading one.pdf again" }));

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
