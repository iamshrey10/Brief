// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/document-actions", () => ({ restoreDocument: vi.fn(), deleteForGood: vi.fn() }));

import { deleteForGood, restoreDocument } from "@/lib/document-actions";
import type { TrashedDocument } from "@/lib/trash";
import { BinList } from "./bin-list";

const restoreMock = vi.mocked(restoreDocument);
const foreverMock = vi.mocked(deleteForGood);

const lease: TrashedDocument = { id: "d1", filename: "maple-lease.pdf", doc_type: "lease", deleted_at: new Date().toISOString(), days_left: 7 };
const loan: TrashedDocument = { id: "d2", filename: "loan.pdf", doc_type: "loan", deleted_at: new Date(Date.now() - 6 * 86_400_000).toISOString(), days_left: 1 };

beforeEach(() => {
  restoreMock.mockReset();
  foreverMock.mockReset();
});
afterEach(cleanup);

describe("the bin list", () => {
  it("shows each document with its kind, when it was deleted and how long is left", () => {
    render(<BinList initial={[lease, loan]} />);

    const list = screen.getByRole("list", { name: "Documents in the bin" });
    expect(within(list).getByText("maple-lease.pdf")).toBeInTheDocument();
    expect(within(list).getByText(/Lease · Deleted today/)).toBeInTheDocument();
    expect(within(list).getByText("7 days left")).toBeInTheDocument();
    expect(within(list).getByText(/Education loan/)).toBeInTheDocument();
    expect(within(list).getByText("Last day")).toBeInTheDocument();
  });

  it("marks a document on its last day more loudly than one with time to spare", () => {
    render(<BinList initial={[lease, loan]} />);

    expect(screen.getByText("Last day").className).toContain("text-destructive");
    expect(screen.getByText("7 days left").className).not.toContain("text-destructive");
  });

  it("says the bin is empty, and for how long deleted documents stay, when there is nothing in it", () => {
    render(<BinList initial={[]} />);

    expect(screen.getByRole("region", { name: "The bin is empty" })).toBeInTheDocument();
    expect(screen.getByText(/stays here for 7 days/)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});

describe("restoring", () => {
  it("brings a document back: it leaves the list, and one line says so with a way to Documents", async () => {
    restoreMock.mockResolvedValue({ ok: true, result: { id: "d1", filename: "maple-lease.pdf", doc_type: "lease", status: "ready", ocr_confidence: null } });
    render(<BinList initial={[lease, loan]} />);

    fireEvent.click(screen.getByRole("button", { name: "Restore maple-lease.pdf" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("maple-lease.pdf was restored."));
    expect(restoreMock).toHaveBeenCalledExactlyOnceWith("d1");
    expect(screen.queryByText("7 days left")).not.toBeInTheDocument();
    expect(screen.getByText("loan.pdf")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Documents" })).toHaveAttribute("href", "/dashboard/documents");
  });

  it("shows the reason, and keeps the document in the bin, when it cannot be restored", async () => {
    restoreMock.mockResolvedValue({ ok: false, message: "You already have the most documents you can keep." });
    render(<BinList initial={[lease]} />);

    fireEvent.click(screen.getByRole("button", { name: "Restore maple-lease.pdf" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("most documents you can keep");
    expect(screen.getByText("maple-lease.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore maple-lease.pdf" })).toBeEnabled();
  });

  it("shows it is working, and cannot be pressed twice, while it restores", async () => {
    let finish: (value: Awaited<ReturnType<typeof restoreDocument>>) => void = () => {};
    restoreMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<BinList initial={[lease]} />);

    fireEvent.click(screen.getByRole("button", { name: "Restore maple-lease.pdf" }));

    expect(await screen.findByText("Restoring...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore maple-lease.pdf" })).toBeDisabled();
    finish({ ok: false, message: "x" });
    await screen.findByRole("alert");
  });
});

describe("deleting for good", () => {
  it("asks first, with Cancel focused so a stray Enter cannot delete anything, and does nothing until confirmed", () => {
    render(<BinList initial={[lease]} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete forever: maple-lease.pdf" }));

    const group = screen.getByRole("group", { name: "Delete maple-lease.pdf for good" });
    expect(within(group).getByText(/can.t be undone/)).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(foreverMock).not.toHaveBeenCalled();
  });

  it("puts the question away with Cancel or Escape, and the document stays", () => {
    render(<BinList initial={[lease]} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete forever: maple-lease.pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("group")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete forever: maple-lease.pdf" }));
    fireEvent.keyDown(screen.getByRole("group"), { key: "Escape" });

    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(screen.getByText("maple-lease.pdf")).toBeInTheDocument();
    expect(foreverMock).not.toHaveBeenCalled();
  });

  it("removes the document and says so once it is confirmed", async () => {
    foreverMock.mockResolvedValue({ ok: true, result: null });
    render(<BinList initial={[lease, loan]} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete forever: maple-lease.pdf" }));

    fireEvent.click(within(screen.getByRole("group")).getByRole("button", { name: "Delete forever" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("maple-lease.pdf was deleted for good."));
    expect(foreverMock).toHaveBeenCalledExactlyOnceWith("d1");
    expect(screen.queryByText("7 days left")).not.toBeInTheDocument();
    expect(screen.getByText("loan.pdf")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open Documents" })).not.toBeInTheDocument();
  });

  it("keeps the question open with the reason when the deletion fails, so it can be tried again", async () => {
    foreverMock.mockResolvedValue({ ok: false, message: "Couldn't delete that just now. Nothing was removed." });
    render(<BinList initial={[lease]} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete forever: maple-lease.pdf" }));

    fireEvent.click(within(screen.getByRole("group")).getByRole("button", { name: "Delete forever" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Nothing was removed");
    expect(screen.getByRole("group")).toBeInTheDocument();
    expect(screen.getByText("maple-lease.pdf")).toBeInTheDocument();
  });
});
