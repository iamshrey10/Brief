// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { MAX_POLL_DURATION_MS, POLL_INTERVAL_MS, type DocumentSummary } from "@/lib/documents";
import { DocumentUpload } from "./document-upload";

function doc(status: string, id = "d1", filename = "loan.pdf"): DocumentSummary {
  return { id, filename, doc_type: "loan", status, ocr_confidence: null };
}

function ok(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

let fetchMock: Mock;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Moves the fake clock forward and lets any resulting state updates settle. */
async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("DocumentUpload polling", () => {
  it("re-checks while a document is processing and shows it as ready", async () => {
    fetchMock.mockResolvedValue(ok([doc("ready")]));
    render(<DocumentUpload initialDocuments={[doc("processing")]} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    await tick(POLL_INTERVAL_MS);

    expect(fetchMock).toHaveBeenCalledWith("/api/backend/documents");
    expect(screen.getByRole("link", { name: /loan\.pdf/ })).toBeInTheDocument();
  });

  it("does not poll when every document is already finished", async () => {
    render(<DocumentUpload initialDocuments={[doc("ready"), doc("failed", "d2")]} />);

    await tick(60_000);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not poll when there are no documents", async () => {
    render(<DocumentUpload initialDocuments={[]} />);

    await tick(60_000);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps checking while the document is still processing", async () => {
    fetchMock.mockResolvedValue(ok([doc("processing")]));
    render(<DocumentUpload initialDocuments={[doc("processing")]} />);

    await tick(POLL_INTERVAL_MS * 3);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stops checking once everything is ready", async () => {
    fetchMock.mockResolvedValue(ok([doc("ready")]));
    render(<DocumentUpload initialDocuments={[doc("processing")]} />);

    await tick(POLL_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await tick(POLL_INTERVAL_MS * 10);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after the time limit instead of polling a stuck document forever", async () => {
    fetchMock.mockResolvedValue(ok([doc("processing")]));
    render(<DocumentUpload initialDocuments={[doc("processing")]} />);

    await tick(MAX_POLL_DURATION_MS + POLL_INTERVAL_MS * 2);
    const callsAtTheLimit = fetchMock.mock.calls.length;
    await tick(POLL_INTERVAL_MS * 20);

    expect(callsAtTheLimit).toBeGreaterThan(90);
    expect(callsAtTheLimit).toBeLessThanOrEqual(MAX_POLL_DURATION_MS / POLL_INTERVAL_MS);
    expect(fetchMock.mock.calls.length).toBe(callsAtTheLimit);
  });

  it("survives a failed check and tries again on the next one", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(ok([doc("ready")]));
    render(<DocumentUpload initialDocuments={[doc("processing")]} />);

    await tick(POLL_INTERVAL_MS);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Processing")).toBeInTheDocument();

    await tick(POLL_INTERVAL_MS);
    expect(screen.getByRole("link", { name: /loan\.pdf/ })).toBeInTheDocument();
  });

  it("keeps the current list when the server answers with an error", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) } as Response);
    render(<DocumentUpload initialDocuments={[doc("processing")]} />);

    await tick(POLL_INTERVAL_MS);

    expect(screen.getByText("loan.pdf")).toBeInTheDocument();
    expect(screen.getByText("Processing")).toBeInTheDocument();
  });

  it("stops checking when the page is closed", async () => {
    fetchMock.mockResolvedValue(ok([doc("processing")]));
    const { unmount } = render(<DocumentUpload initialDocuments={[doc("processing")]} />);
    await tick(POLL_INTERVAL_MS);
    const callsBeforeClosing = fetchMock.mock.calls.length;

    unmount();
    await tick(POLL_INTERVAL_MS * 10);

    expect(fetchMock.mock.calls.length).toBe(callsBeforeClosing);
  });
});

describe("DocumentUpload after an upload", () => {
  it("shows the new document as processing, then as a ready link, without a refresh", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/backend/documents" && method === "POST") {
        return ok({ document_id: "d9", upload_url: "https://storage.example/upload" });
      }
      if (url === "https://storage.example/upload" && method === "PUT") return { ok: true } as Response;
      if (url === "/api/backend/documents/d9/confirm" && method === "PATCH") {
        return ok(doc("uploaded", "d9"));
      }
      if (url === "/api/backend/documents" && method === "GET") return ok([doc("ready", "d9")]);
      throw new Error(`unexpected request: ${method} ${url}`);
    });
    render(<DocumentUpload initialDocuments={[]} />);

    // fireEvent rather than userEvent: userEvent waits on a real timer, which the fake clock
    // this test needs for the polling would never fire.
    fireEvent.change(screen.getByLabelText("Document"), {
      target: { files: [new File(["%PDF"], "loan.pdf", { type: "application/pdf" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await tick(0);

    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    await tick(POLL_INTERVAL_MS);

    expect(screen.getByRole("link", { name: /loan\.pdf/ })).toHaveAttribute(
      "href",
      "/dashboard/documents/d9",
    );
    expect(screen.queryByText("Processing")).not.toBeInTheDocument();
  });
});
