// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocumentSummary } from "@/lib/documents";
import { deleteDocument, updateDocument } from "@/lib/document-actions";
import { retryDocument } from "@/lib/retry";
import { rereadDocument } from "@/lib/reread";
import { DocumentList } from "./document-list";

vi.mock("@/lib/document-actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/document-actions")>();
  return { ...actual, deleteDocument: vi.fn(), updateDocument: vi.fn() };
});

vi.mock("@/lib/retry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/retry")>();
  return { ...actual, retryDocument: vi.fn() };
});

vi.mock("@/lib/reread", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reread")>();
  return { ...actual, rereadDocument: vi.fn() };
});

const retryMock = vi.mocked(retryDocument);
const rereadMock = vi.mocked(rereadDocument);
const deleteMock = vi.mocked(deleteDocument);
const updateMock = vi.mocked(updateDocument);

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

  describe("why a read failed", () => {
    it("says why on a failed document, in plain words", () => {
      render(<DocumentList documents={[doc("failed", "a", "scan.pdf", { failure_reason: "no_text" })]} />);

      expect(screen.getByText(/No text could be found/)).toBeInTheDocument();
      expect(screen.queryByText("no_text")).not.toBeInTheDocument();
    });

    it("shows a different message for a different reason", () => {
      render(
        <DocumentList
          documents={[
            doc("failed", "a", "one.pdf", { failure_reason: "daily_limit" }),
            doc("failed", "b", "two.pdf", { failure_reason: "storage" }),
          ]}
        />,
      );

      expect(screen.getByText(/limit has been reached/)).toBeInTheDocument();
      expect(screen.getByText(/could not be fetched/)).toBeInTheDocument();
    });

    it("still gives an honest message when the reason is missing", () => {
      render(<DocumentList documents={[doc("failed", "a", "old.pdf")]} />);

      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    });

    it("keeps Try again beside the message", () => {
      render(<DocumentList documents={[doc("failed", "a", "scan.pdf", { failure_reason: "rate_limit" })]} />);

      expect(screen.getByText(/busy right now/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Try reading scan.pdf again" })).toBeInTheDocument();
    });

    it("shows no message on documents that have not failed", () => {
      render(
        <DocumentList
          documents={[
            doc("ready", "a", "a.pdf", { failure_reason: "no_text" }),
            doc("processing", "b", "b.pdf", { failure_reason: "no_text" }),
            doc("needs_retake", "c", "c.pdf"),
          ]}
        />,
      );

      expect(screen.queryByText(/No text could be found/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Something went wrong/)).not.toBeInTheDocument();
    });
  });

  describe("how far a read has got", () => {
    it("shows how many parts of a long document are read so far", () => {
      render(
        <DocumentList
          documents={[doc("processing", "a", "long.pdf", { progress_done: 120, progress_total: 286 })]}
        />,
      );

      expect(screen.getByText("Reading part 120 of 286")).toBeInTheDocument();
    });

    it("shows nothing extra before the parts are counted", () => {
      render(<DocumentList documents={[doc("processing", "a", "new.pdf")]} />);

      expect(screen.queryByText(/Reading part/)).not.toBeInTheDocument();
      expect(screen.getByText("Processing")).toBeInTheDocument();
    });

    it("shows progress for each document being read, and for none that is not", () => {
      render(
        <DocumentList
          documents={[
            doc("processing", "a", "one.pdf", { progress_done: 1, progress_total: 4 }),
            doc("processing", "b", "two.pdf", { progress_done: 3, progress_total: 9 }),
            doc("ready", "c", "done.pdf", { progress_done: 5, progress_total: 5 }),
          ]}
        />,
      );

      expect(screen.getByText("Reading part 1 of 4")).toBeInTheDocument();
      expect(screen.getByText("Reading part 3 of 9")).toBeInTheDocument();
      expect(screen.queryByText("Reading part 5 of 5")).not.toBeInTheDocument();
    });
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

    it("does not offer it on a document that was uploaded long ago but only just started being read again", () => {
      render(
        <DocumentList
          documents={[
            doc("processing", "a", "retried.pdf", {
              created_at: minutesAgo(60 * 24),
              status_changed_at: minutesAgo(1),
            }),
          ]}
        />,
      );

      expect(screen.getByText("Processing")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /try reading/i })).not.toBeInTheDocument();
    });

    it.each(["ready", "needs_retake"])("does not offer it on a %s document", (status) => {
      render(<DocumentList documents={[doc(status)]} />);

      expect(screen.queryByRole("button", { name: /try reading/i })).not.toBeInTheDocument();
    });

    it("does not offer it on a document that was only just uploaded", () => {
      render(
        <DocumentList documents={[doc("processing", "a", "new.pdf", { created_at: minutesAgo(1) })]} />,
      );

      expect(screen.queryByRole("button", { name: /try reading/i })).not.toBeInTheDocument();
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

  describe("edit and delete buttons", () => {
    it("puts an Edit and a Delete button on every row, named for its file", () => {
      render(<DocumentList documents={[doc("ready", "a", "one.pdf"), doc("failed", "b", "two.pdf")]} />);

      for (const name of ["one.pdf", "two.pdf"]) {
        expect(screen.getByRole("button", { name: `Edit ${name}` })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: `Delete ${name}` })).toBeInTheDocument();
      }
    });

    it("keeps the buttons outside the link, so pressing one never opens the document", () => {
      render(<DocumentList documents={[doc("ready", "a", "one.pdf")]} />);

      const link = screen.getByRole("link");
      expect(link).not.toContainElement(screen.getByRole("button", { name: "Edit one.pdf" }));
      expect(link).not.toContainElement(screen.getByRole("button", { name: "Delete one.pdf" }));
      expect(link).toHaveAttribute("href", "/dashboard/documents/a");
    });
  });

  describe("editing", () => {
    async function openEdit(documents = [doc("ready", "a", "Lease.pdf", { doc_type: "lease" })]) {
      const user = userEvent.setup();
      const onUpdated = vi.fn();
      render(<DocumentList documents={documents} onUpdated={onUpdated} />);
      await user.click(screen.getByRole("button", { name: `Edit ${documents[0].filename}` }));
      return { user, onUpdated };
    }

    it("puts the keyboard in the name field as soon as the form opens", async () => {
      await openEdit();

      expect(screen.getByLabelText("Name")).toHaveFocus();
    });

    it("puts focus back on the Edit button when the form is closed", async () => {
      const { user } = await openEdit();

      await user.keyboard("{Escape}");

      expect(screen.getByRole("button", { name: "Edit Lease.pdf" })).toHaveFocus();
    });

    it("puts focus back on the Edit button after saving", async () => {
      updateMock.mockResolvedValue({ ok: true, result: doc("ready", "a", "Lease.pdf", { doc_type: "loan" }) });
      const { user } = await openEdit();
      await user.selectOptions(screen.getByLabelText("Kind"), "loan");

      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(screen.getByRole("button", { name: "Edit Lease.pdf" })).toHaveFocus());
    });

    it("opens a form with the current name and kind, and Save waits for a change", async () => {
      await openEdit();

      expect(screen.getByLabelText("Name")).toHaveValue("Lease.pdf");
      expect(screen.getByLabelText("Kind")).toHaveValue("lease");
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("saves a new name, sending only the name, and hands back the updated document", async () => {
      const updated = doc("ready", "a", "Renamed.pdf", { doc_type: "lease" });
      updateMock.mockResolvedValue({ ok: true, result: updated });
      const { user, onUpdated } = await openEdit();

      await user.clear(screen.getByLabelText("Name"));
      await user.type(screen.getByLabelText("Name"), "Renamed.pdf");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(updateMock).toHaveBeenCalledWith("a", { filename: "Renamed.pdf" });
      await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updated));
      expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    });

    it("saves a new kind, sending only the kind", async () => {
      updateMock.mockResolvedValue({ ok: true, result: doc("ready", "a", "Lease.pdf", { doc_type: "loan" }) });
      const { user } = await openEdit();

      await user.selectOptions(screen.getByLabelText("Kind"), "loan");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(updateMock).toHaveBeenCalledWith("a", { doc_type: "loan" });
    });

    it("sends both when both changed", async () => {
      updateMock.mockResolvedValue({ ok: true, result: doc("ready", "a") });
      const { user } = await openEdit();

      await user.clear(screen.getByLabelText("Name"));
      await user.type(screen.getByLabelText("Name"), "New.pdf");
      await user.selectOptions(screen.getByLabelText("Kind"), "offer");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(updateMock).toHaveBeenCalledWith("a", { filename: "New.pdf", doc_type: "offer" });
    });

    it("warns that changing the kind clears the saved key terms and questions, but not for a rename", async () => {
      const { user } = await openEdit();

      await user.type(screen.getByLabelText("Name"), " v2");
      expect(screen.queryByText(/clears this document's saved key terms/i)).not.toBeInTheDocument();

      await user.selectOptions(screen.getByLabelText("Kind"), "loan");
      expect(screen.getByText(/clears this document's saved key terms/i)).toBeInTheDocument();

      await user.selectOptions(screen.getByLabelText("Kind"), "lease");
      expect(screen.queryByText(/clears this document's saved key terms/i)).not.toBeInTheDocument();
    });

    it("trims the name before sending it", async () => {
      updateMock.mockResolvedValue({ ok: true, result: doc("ready", "a") });
      const { user } = await openEdit();

      await user.clear(screen.getByLabelText("Name"));
      await user.type(screen.getByLabelText("Name"), "   Spaced out.pdf   ");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(updateMock).toHaveBeenCalledWith("a", { filename: "Spaced out.pdf" });
    });

    it("will not save an empty or blank name, and says why", async () => {
      const { user } = await openEdit();

      await user.clear(screen.getByLabelText("Name"));
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      expect(screen.getByText("A name can't be empty.")).toBeInTheDocument();

      await user.type(screen.getByLabelText("Name"), "   ");
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("treats a change that is only spaces around the same name as no change", async () => {
      const { user } = await openEdit();

      await user.type(screen.getByLabelText("Name"), "   ");

      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("limits the name to 200 characters", async () => {
      await openEdit();

      expect(screen.getByLabelText("Name")).toHaveAttribute("maxlength", "200");
    });

    it("goes back without saving when Cancel is pressed", async () => {
      const { user } = await openEdit();
      await user.type(screen.getByLabelText("Name"), " changed");

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(updateMock).not.toHaveBeenCalled();
      expect(screen.getByText("Lease.pdf")).toBeInTheDocument();
      expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    });

    it("goes back without saving when Escape is pressed", async () => {
      const { user } = await openEdit();

      await user.keyboard("{Escape}");

      expect(updateMock).not.toHaveBeenCalled();
      expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    });

    it("saves with Enter", async () => {
      updateMock.mockResolvedValue({ ok: true, result: doc("ready", "a", "Via Enter.pdf") });
      const { user } = await openEdit();

      await user.clear(screen.getByLabelText("Name"));
      await user.type(screen.getByLabelText("Name"), "Via Enter.pdf{Enter}");

      expect(updateMock).toHaveBeenCalledWith("a", { filename: "Via Enter.pdf" });
    });

    it("locks the form while saving, and ignores Escape until it is done", async () => {
      updateMock.mockReturnValue(new Promise(() => {}));
      const { user } = await openEdit();
      await user.type(screen.getByLabelText("Name"), " v2");

      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
      expect(screen.getByLabelText("Name")).toBeDisabled();
      expect(screen.getByLabelText("Kind")).toBeDisabled();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
      // Sent straight to the form: focus leaves a button that has just been disabled, so a key
      // pressed with nothing focused would never reach it and this check would pass for free.
      fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Escape" });
      expect(screen.getByLabelText("Name")).toBeInTheDocument();
      expect(updateMock).toHaveBeenCalledTimes(1);
    });

    it("says what went wrong, keeps what was typed, and can be tried again", async () => {
      updateMock.mockResolvedValueOnce({ ok: false, message: "Couldn't save that just now." });
      updateMock.mockResolvedValueOnce({ ok: true, result: doc("ready", "a", "Typed.pdf") });
      const { user, onUpdated } = await openEdit();
      await user.clear(screen.getByLabelText("Name"));
      await user.type(screen.getByLabelText("Name"), "Typed.pdf");

      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save that just now.");
      expect(screen.getByLabelText("Name")).toHaveValue("Typed.pdf");
      expect(onUpdated).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(onUpdated).toHaveBeenCalled());
    });

    it("includes a kind it no longer offers, so the form can still be opened", async () => {
      await openEdit([doc("ready", "a", "Old.pdf", { doc_type: "mortgage" })]);

      expect(screen.getByLabelText("Kind")).toHaveValue("mortgage");
    });

    it("opens only the row that was asked for", async () => {
      const user = userEvent.setup();
      render(<DocumentList documents={[doc("ready", "a", "one.pdf"), doc("ready", "b", "two.pdf")]} />);

      await user.click(screen.getByRole("button", { name: "Edit two.pdf" }));

      expect(screen.getAllByLabelText("Name")).toHaveLength(1);
      expect(screen.getByText("one.pdf")).toBeInTheDocument();
    });
  });

  describe("reading again", () => {
    async function openReread(documents = [doc("ready", "a", "Lease.pdf")]) {
      const user = userEvent.setup();
      const onRetried = vi.fn();
      render(<DocumentList documents={documents} onRetried={onRetried} />);
      await user.click(screen.getByRole("button", { name: `Read ${documents[0].filename} again` }));
      return { user, onRetried };
    }

    it.each(["ready", "needs_retake"])("offers Read again on a %s document", (status) => {
      render(<DocumentList documents={[doc(status, "a", "Lease.pdf")]} />);

      expect(screen.getByRole("button", { name: "Read Lease.pdf again" })).toBeInTheDocument();
    });

    it.each(["pending", "uploaded", "processing", "failed"])("does not offer it on a %s document", (status) => {
      render(<DocumentList documents={[doc(status, "a", "Lease.pdf")]} />);

      expect(screen.queryByRole("button", { name: "Read Lease.pdf again" })).not.toBeInTheDocument();
    });

    it("asks first, naming the file and saying the old reading is replaced", async () => {
      await openReread();

      const question = screen.getByRole("group", { name: "Read Lease.pdf again" });
      expect(question).toHaveTextContent("Read “Lease.pdf” again?");
      expect(question).toHaveTextContent("replaces what Brief read before");
      expect(rereadMock).not.toHaveBeenCalled();
    });

    it("starts on Cancel and goes back without reading when Cancel or Escape is used", async () => {
      const { user } = await openReread();
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

      await user.keyboard("{Escape}");

      expect(rereadMock).not.toHaveBeenCalled();
      expect(screen.queryByRole("group")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Read Lease.pdf again" })).toHaveFocus();
    });

    it("reads again when confirmed and hands the updated document to the page", async () => {
      const updated = doc("uploaded", "a", "Lease.pdf");
      rereadMock.mockResolvedValue({ ok: true, document: updated });
      const { user, onRetried } = await openReread();

      await user.click(screen.getByRole("button", { name: "Read again" }));

      expect(rereadMock).toHaveBeenCalledWith("a");
      await waitFor(() => expect(onRetried).toHaveBeenCalledWith(updated));
    });

    it("shows why and stays open when it cannot start", async () => {
      rereadMock.mockResolvedValue({ ok: false, message: "This document can't be read again right now." });
      const { user, onRetried } = await openReread();

      await user.click(screen.getByRole("button", { name: "Read again" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("can't be read again right now");
      expect(onRetried).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Read again" })).toBeEnabled();
    });

    it("locks both buttons and ignores Escape while it starts", async () => {
      rereadMock.mockReturnValue(new Promise(() => {}));
      const { user } = await openReread();

      await user.click(screen.getByRole("button", { name: "Read again" }));

      expect(screen.getByRole("button", { name: "Starting..." })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
      fireEvent.keyDown(screen.getByRole("group"), { key: "Escape" });
      expect(screen.getByRole("group")).toBeInTheDocument();
    });
  });

  describe("deleting", () => {
    async function openDelete(documents = [doc("ready", "a", "Lease.pdf")]) {
      const user = userEvent.setup();
      const onDeleted = vi.fn();
      render(<DocumentList documents={documents} onDeleted={onDeleted} />);
      await user.click(screen.getByRole("button", { name: `Delete ${documents[0].filename}` }));
      return { user, onDeleted };
    }

    it("asks first, naming the file and saying what is lost and that it cannot be undone", async () => {
      await openDelete();

      const question = screen.getByRole("group", { name: "Delete Lease.pdf" });
      expect(question).toHaveTextContent("Delete “Lease.pdf”?");
      expect(question).toHaveTextContent("removes the file and everything Brief read from it");
      expect(question).toHaveTextContent("can't be undone");
      expect(deleteMock).not.toHaveBeenCalled();
    });

    it("starts on Cancel, so pressing Enter by accident cannot delete anything", async () => {
      await openDelete();

      expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    });

    it("goes back without deleting when Cancel is pressed", async () => {
      const { user } = await openDelete();

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(deleteMock).not.toHaveBeenCalled();
      expect(screen.getByText("Lease.pdf")).toBeInTheDocument();
      expect(screen.queryByRole("group")).not.toBeInTheDocument();
    });

    it("puts focus back on the Delete button when the question is cancelled", async () => {
      const { user } = await openDelete();

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.getByRole("button", { name: "Delete Lease.pdf" })).toHaveFocus();
    });

    it("goes back without deleting when Escape is pressed", async () => {
      const { user } = await openDelete();

      await user.keyboard("{Escape}");

      expect(deleteMock).not.toHaveBeenCalled();
      expect(screen.queryByRole("group")).not.toBeInTheDocument();
    });

    it("deletes that document when confirmed and tells the page which one", async () => {
      deleteMock.mockResolvedValue({ ok: true, result: null });
      const { user, onDeleted } = await openDelete();

      await user.click(screen.getByRole("button", { name: "Delete" }));

      expect(deleteMock).toHaveBeenCalledWith("a");
      await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("a"));
    });

    it("shows progress, locks both buttons, and ignores Escape while deleting", async () => {
      deleteMock.mockReturnValue(new Promise(() => {}));
      const { user } = await openDelete();

      await user.click(screen.getByRole("button", { name: "Delete" }));

      expect(screen.getByRole("button", { name: "Deleting..." })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
      fireEvent.keyDown(screen.getByRole("group"), { key: "Escape" });
      expect(screen.getByRole("group")).toBeInTheDocument();
      expect(deleteMock).toHaveBeenCalledTimes(1);
    });

    it("says what went wrong, does not report it deleted, and can be tried again", async () => {
      deleteMock.mockResolvedValueOnce({ ok: false, message: "Couldn't delete that just now. Nothing was removed." });
      deleteMock.mockResolvedValueOnce({ ok: true, result: null });
      const { user, onDeleted } = await openDelete();

      await user.click(screen.getByRole("button", { name: "Delete" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Nothing was removed");
      expect(onDeleted).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();

      await user.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("a"));
    });

    it("asks about only the row that was chosen", async () => {
      const user = userEvent.setup();
      render(<DocumentList documents={[doc("ready", "a", "one.pdf"), doc("ready", "b", "two.pdf")]} />);

      await user.click(screen.getByRole("button", { name: "Delete two.pdf" }));

      expect(screen.getAllByRole("group")).toHaveLength(1);
      expect(screen.getByRole("group", { name: "Delete two.pdf" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /one\.pdf/ })).toBeInTheDocument();
    });
  });
});
