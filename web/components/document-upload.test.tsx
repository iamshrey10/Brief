// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { MAX_POLL_DURATION_MS, POLL_INTERVAL_MS, type DocumentSummary } from "@/lib/documents";
import { DocumentUpload } from "./document-upload";

function doc(
  status: string,
  id = "d1",
  filename = "loan.pdf",
  extra: Partial<DocumentSummary> = {},
): DocumentSummary {
  return { id, filename, doc_type: "loan", status, ocr_confidence: null, ...extra };
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
    fireEvent.change(screen.getByLabelText("Choose a file to upload"), {
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

describe("DocumentUpload form", () => {
  const pdf = (name = "loan.pdf") => new File(["%PDF"], name, { type: "application/pdf" });

  function withSize(file: File, bytes: number): File {
    Object.defineProperty(file, "size", { value: bytes });
    return file;
  }

  function dropZone(): HTMLElement {
    const zone = screen.getByText(/drop a contract here/i).closest("label");
    if (!zone) throw new Error("no drop area");
    return zone;
  }

  function chooseFile(file: File) {
    fireEvent.change(screen.getByLabelText("Choose a file to upload"), { target: { files: [file] } });
  }

  /** A server that accepts an upload, recording what was asked of it. */
  function acceptUploads() {
    const requests: { url: string; method: string; body?: string; contentType?: string }[] = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      requests.push({
        url,
        method,
        body: typeof init?.body === "string" ? init.body : undefined,
        contentType: (init?.headers as Record<string, string> | undefined)?.["Content-Type"],
      });
      if (url === "/api/backend/documents" && method === "POST") {
        return ok({ document_id: "d9", upload_url: "https://storage.example/upload" });
      }
      if (url === "https://storage.example/upload") return { ok: true } as Response;
      if (url.endsWith("/confirm")) return ok(doc("uploaded", "d9"));
      throw new Error(`unexpected request: ${method} ${url}`);
    });
    return requests;
  }

  it("invites a file with what it accepts, and will not upload until one is chosen", () => {
    render(<DocumentUpload initialDocuments={[]} />);

    expect(screen.getByText(/drop a contract here/i)).toBeInTheDocument();
    expect(screen.getByText("PDF, JPG, PNG, or HEIC, up to 50 MB")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
  });

  it("shows the chosen file's name and size in place of the drop area, and lets it be removed", () => {
    render(<DocumentUpload initialDocuments={[]} />);

    chooseFile(withSize(pdf("Lease 2026.pdf"), 2.4 * 1024 * 1024));

    expect(screen.getByText("Lease 2026.pdf")).toBeInTheDocument();
    expect(screen.getByText("2.4 MB")).toBeInTheDocument();
    expect(screen.queryByText(/drop a contract here/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Remove Lease 2026.pdf" }));

    expect(screen.getByText(/drop a contract here/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
  });

  it("takes a file dropped onto the drop area", () => {
    render(<DocumentUpload initialDocuments={[]} />);

    fireEvent.drop(dropZone(), { dataTransfer: { files: [pdf("dropped.pdf")] } });

    expect(screen.getByText("dropped.pdf")).toBeInTheDocument();
  });

  it("highlights the drop area while a file is held over it and stops when it leaves", () => {
    render(<DocumentUpload initialDocuments={[]} />);

    fireEvent.dragOver(dropZone());
    expect(dropZone()).toHaveClass("border-primary");

    fireEvent.dragLeave(dropZone());
    expect(dropZone()).not.toHaveClass("border-primary");
  });

  it("stops highlighting once a file has been dropped", () => {
    render(<DocumentUpload initialDocuments={[]} />);
    const zone = dropZone();

    fireEvent.dragOver(zone);
    fireEvent.drop(zone, { dataTransfer: { files: [pdf()] } });

    expect(screen.queryByText(/drop a contract here/i)).not.toBeInTheDocument();
  });

  it("turns away a dropped file that is not a kind it can read, on the spot", () => {
    render(<DocumentUpload initialDocuments={[]} />);

    fireEvent.drop(dropZone(), {
      dataTransfer: { files: [new File(["x"], "notes.txt", { type: "text/plain" })] },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("That kind of file isn't supported");
    expect(screen.getByText(/drop a contract here/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
  });

  it("turns away a file over 50 MB on the spot", () => {
    render(<DocumentUpload initialDocuments={[]} />);

    chooseFile(withSize(pdf("huge.pdf"), 51 * 1024 * 1024));

    expect(screen.getByRole("alert")).toHaveTextContent("larger than the 50 MB limit");
    expect(screen.queryByText("huge.pdf")).not.toBeInTheDocument();
  });

  it("accepts a file of exactly 50 MB", () => {
    render(<DocumentUpload initialDocuments={[]} />);

    chooseFile(withSize(pdf("limit.pdf"), 50 * 1024 * 1024));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("limit.pdf")).toBeInTheDocument();
  });

  it("clears the error once a good file is chosen", () => {
    render(<DocumentUpload initialDocuments={[]} />);
    chooseFile(withSize(pdf("huge.pdf"), 51 * 1024 * 1024));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    chooseFile(pdf("fine.pdf"));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("lets the kind of document be picked, starting on education loan", () => {
    render(<DocumentUpload initialDocuments={[]} />);

    expect(screen.getByRole("radio", { name: "Education loan" })).toBeChecked();

    fireEvent.click(screen.getByRole("radio", { name: "Lease" }));

    expect(screen.getByRole("radio", { name: "Lease" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Education loan" })).not.toBeChecked();
  });

  it("uploads with the kind of document that was picked", async () => {
    const requests = acceptUploads();
    render(<DocumentUpload initialDocuments={[]} />);

    chooseFile(pdf());
    fireEvent.click(screen.getByRole("radio", { name: "Job offer" }));
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await tick(0);

    const create = requests.find((r) => r.method === "POST");
    expect(JSON.parse(create?.body ?? "{}")).toMatchObject({ filename: "loan.pdf", doc_type: "offer" });
  });

  it("uploads a PDF as a PDF", async () => {
    const requests = acceptUploads();
    render(<DocumentUpload initialDocuments={[]} />);

    chooseFile(pdf());
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await tick(0);

    const create = requests.find((r) => r.method === "POST");
    expect(JSON.parse(create?.body ?? "{}").content_type).toBe("application/pdf");
    expect(requests.find((r) => r.url === "https://storage.example/upload")?.contentType).toBe(
      "application/pdf",
    );
  });

  it("uploads a photo the browser gave no type for as the right kind, not as a PDF", async () => {
    const requests = acceptUploads();
    render(<DocumentUpload initialDocuments={[]} />);

    chooseFile(new File(["x"], "IMG_0042.HEIC", { type: "" }));
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await tick(0);

    const create = requests.find((r) => r.method === "POST");
    expect(JSON.parse(create?.body ?? "{}").content_type).toBe("image/heic");
    expect(requests.find((r) => r.url === "https://storage.example/upload")?.contentType).toBe(
      "image/heic",
    );
  });

  it("clears the chosen file once the upload has gone through", async () => {
    acceptUploads();
    render(<DocumentUpload initialDocuments={[]} />);

    chooseFile(pdf());
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await tick(0);

    expect(screen.getByText(/drop a contract here/i)).toBeInTheDocument();
  });

  it("keeps the file and says what went wrong when the upload fails, so it can be tried again", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/backend/documents" && init?.method === "POST") {
        return { ok: false, json: async () => ({}) } as Response;
      }
      throw new Error(`unexpected request: ${url}`);
    });
    render(<DocumentUpload initialDocuments={[]} />);

    chooseFile(pdf("keep-me.pdf"));
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await tick(0);

    expect(screen.getByRole("alert")).toHaveTextContent("could not start the upload");
    expect(screen.getByText("keep-me.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled();
  });

  it("shows the server's own sentence when the document limit is reached", async () => {
    const detail = "You can keep up to 25 documents. Delete one you no longer need to upload another.";
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/backend/documents" && init?.method === "POST") {
        return { ok: false, status: 409, json: async () => ({ detail }) } as Response;
      }
      throw new Error(`unexpected request: ${url}`);
    });
    render(<DocumentUpload initialDocuments={[]} />);

    chooseFile(pdf("one-too-many.pdf"));
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await tick(0);

    expect(screen.getByRole("alert")).toHaveTextContent(detail);
    expect(screen.getByText("one-too-many.pdf")).toBeInTheDocument();
  });

  it("locks the form while uploading, so nothing can change under a request in flight", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    render(<DocumentUpload initialDocuments={[]} />);

    chooseFile(pdf("busy.pdf"));
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await tick(0);

    expect(screen.getByRole("button", { name: "Uploading..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove busy.pdf" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Lease" })).toBeDisabled();
  });

  it("does not list a document twice when a refresh picks it up while it is still uploading", async () => {
    // The refresh runs because another document is still processing. The new document already
    // exists on the server before its upload finishes, so the refresh can include it, and the
    // upload then reports it again.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let finishConfirm: (response: Response) => void = () => {};
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/backend/documents" && method === "POST") {
        return ok({ document_id: "d9", upload_url: "https://storage.example/upload" });
      }
      if (url === "https://storage.example/upload") return { ok: true } as Response;
      if (url.endsWith("/confirm")) {
        return new Promise<Response>((resolve) => {
          finishConfirm = resolve;
        });
      }
      if (url === "/api/backend/documents" && method === "GET") {
        return ok([doc("pending", "d9", "new.pdf"), doc("processing", "d1", "old.pdf")]);
      }
      throw new Error(`unexpected request: ${method} ${url}`);
    });
    render(<DocumentUpload initialDocuments={[doc("processing", "d1", "old.pdf")]} />);

    chooseFile(pdf("new.pdf"));
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await tick(0); // the upload is now waiting to be confirmed
    await tick(POLL_INTERVAL_MS); // a refresh runs and already sees the new document
    // Counted inside the list only, the upload card above it also shows the file's name.
    const listed = () =>
      within(screen.getByRole("region", { name: "Your documents" })).getAllByText("new.pdf");
    expect(listed()).toHaveLength(1);

    await act(async () => {
      finishConfirm(ok(doc("uploaded", "d9", "new.pdf")));
    });
    await tick(0);

    expect(listed()).toHaveLength(1);
    const duplicateKeyWarnings = errorSpy.mock.calls.filter((call) =>
      String(call[0]).includes("two children with the same key"),
    );
    expect(duplicateKeyWarnings).toHaveLength(0);
    errorSpy.mockRestore();
  });

  it("keeps a just-uploaded document on screen when a refresh that started earlier does not include it", async () => {
    // A refresh that was already in flight before the upload began can come back without the new
    // document. It must not make the document vanish until the next refresh.
    let releaseRefresh: (response: Response) => void = () => {};
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/backend/documents" && method === "POST") {
        return ok({ document_id: "d9", upload_url: "https://storage.example/upload" });
      }
      if (url === "https://storage.example/upload") return { ok: true } as Response;
      if (url.endsWith("/confirm")) return ok(doc("uploaded", "d9", "new.pdf"));
      if (url === "/api/backend/documents" && method === "GET") {
        return new Promise<Response>((resolve) => {
          releaseRefresh = resolve;
        });
      }
      throw new Error(`unexpected request: ${method} ${url}`);
    });
    render(<DocumentUpload initialDocuments={[doc("processing", "d1", "old.pdf")]} />);

    await tick(POLL_INTERVAL_MS); // a refresh starts and is left waiting
    chooseFile(pdf("new.pdf"));
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await tick(0);
    expect(screen.getByText("new.pdf")).toBeInTheDocument();

    await act(async () => {
      releaseRefresh(ok([doc("processing", "d1", "old.pdf")])); // an older snapshot, no new.pdf
    });
    await tick(0);

    expect(screen.getByText("new.pdf")).toBeInTheDocument();
    expect(screen.getByText("old.pdf")).toBeInTheDocument();
  });

  it("starts reading a failed document again from its row, and shows it as processing", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/backend/documents/d1/retry" && init?.method === "POST") {
        return ok(doc("uploaded", "d1", "broken.pdf"));
      }
      if (url === "/api/backend/documents" && (init?.method ?? "GET") === "GET") {
        return ok([doc("ready", "d1", "broken.pdf")]);
      }
      throw new Error(`unexpected request: ${init?.method ?? "GET"} ${url}`);
    });
    render(<DocumentUpload initialDocuments={[doc("failed", "d1", "broken.pdf")]} />);
    expect(screen.getByText("Couldn't read")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try reading broken.pdf again" }));
    await tick(0);

    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't read")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try reading/i })).not.toBeInTheDocument();

    // and the page starts checking on it by itself, until it is ready
    await tick(POLL_INTERVAL_MS);

    expect(screen.getByRole("link", { name: /broken\.pdf/ })).toBeInTheDocument();
  });
});

describe("DocumentUpload deleting and editing", () => {
  const withTwo = () => [doc("processing", "p", "busy.pdf"), doc("ready", "r", "keep.pdf")];

  function respond(handlers: Record<string, (init?: RequestInit) => Response | Promise<Response>>) {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const handler = handlers[`${init?.method ?? "GET"} ${url}`];
      if (!handler) throw new Error(`unexpected request: ${init?.method ?? "GET"} ${url}`);
      return handler(init);
    });
  }

  const deleted = { ok: true, status: 204 } as Response;

  /** Gone entirely: no row, and not even the "Delete keep.pdf?" question left behind. */
  function expectCompletelyGone(name: string) {
    const pattern = new RegExp(name.replace(".", "\\."));
    expect(screen.queryByText(pattern)).not.toBeInTheDocument();
    // The delete question is a group named "Delete <file>". The page's own form is a group too.
    expect(screen.queryByRole("group", { name: new RegExp(`^Delete ${pattern.source}`) })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: pattern })).not.toBeInTheDocument();
  }

  async function confirmDelete(name: string) {
    fireEvent.click(screen.getByRole("button", { name: `Delete ${name}` }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await tick(0);
  }

  async function rename(from: string, to: string) {
    fireEvent.click(screen.getByRole("button", { name: `Edit ${from}` }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: to } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await tick(0);
  }

  it("removes a deleted document from the list", async () => {
    respond({ "DELETE /api/backend/documents/r": () => deleted });
    render(<DocumentUpload initialDocuments={withTwo()} />);

    await confirmDelete("keep.pdf");

    expectCompletelyGone("keep.pdf");
    expect(screen.getByText("busy.pdf")).toBeInTheDocument();
  });

  it("keeps a document deleted even when a refresh that began earlier still lists it", async () => {
    let releaseRefresh: (r: Response) => void = () => {};
    respond({
      "DELETE /api/backend/documents/r": () => deleted,
      "GET /api/backend/documents": () => new Promise<Response>((resolve) => (releaseRefresh = resolve)),
    });
    render(<DocumentUpload initialDocuments={withTwo()} />);
    await tick(POLL_INTERVAL_MS); // a refresh starts and is left waiting

    await confirmDelete("keep.pdf");
    await act(async () => {
      releaseRefresh(ok(withTwo())); // the old snapshot still has it
    });
    await tick(0);

    expectCompletelyGone("keep.pdf");
  });

  it("keeps it gone on every later refresh too", async () => {
    respond({
      "DELETE /api/backend/documents/r": () => deleted,
      "GET /api/backend/documents": () => ok(withTwo()),
    });
    render(<DocumentUpload initialDocuments={withTwo()} />);
    await confirmDelete("keep.pdf");

    await tick(POLL_INTERVAL_MS);
    await tick(POLL_INTERVAL_MS);

    expectCompletelyGone("keep.pdf");
  });

  it("leaves a document in the list when the delete fails", async () => {
    respond({ "DELETE /api/backend/documents/r": () => ({ ok: false, status: 502 }) as Response });
    render(<DocumentUpload initialDocuments={withTwo()} />);

    await confirmDelete("keep.pdf");

    expect(screen.getByText(/nothing was removed/i)).toBeInTheDocument();
    // Still listed: the row is still asking, so the delete can be tried again.
    expect(screen.getByRole("group", { name: "Delete keep.pdf" })).toBeInTheDocument();
  });

  it("shows the new name after a rename", async () => {
    respond({
      "PATCH /api/backend/documents/r": () => ok(doc("ready", "r", "Renamed.pdf")),
    });
    render(<DocumentUpload initialDocuments={withTwo()} />);

    await rename("keep.pdf", "Renamed.pdf");

    expect(screen.getByText("Renamed.pdf")).toBeInTheDocument();
    expectCompletelyGone("keep.pdf");
  });

  it("sends only the name for a rename", async () => {
    respond({ "PATCH /api/backend/documents/r": () => ok(doc("ready", "r", "Renamed.pdf")) });
    render(<DocumentUpload initialDocuments={withTwo()} />);

    await rename("keep.pdf", "Renamed.pdf");

    const patch = fetchMock.mock.calls.find((c) => c[1]?.method === "PATCH");
    expect(JSON.parse(patch?.[1].body)).toEqual({ filename: "Renamed.pdf" });
  });

  it("keeps the new name when a refresh that began earlier comes back with the old one", async () => {
    let releaseRefresh: (r: Response) => void = () => {};
    respond({
      "PATCH /api/backend/documents/r": () => ok(doc("ready", "r", "Renamed.pdf")),
      "GET /api/backend/documents": () => new Promise<Response>((resolve) => (releaseRefresh = resolve)),
    });
    render(<DocumentUpload initialDocuments={withTwo()} />);
    await tick(POLL_INTERVAL_MS);

    await rename("keep.pdf", "Renamed.pdf");
    await act(async () => {
      releaseRefresh(ok(withTwo())); // the old snapshot still has the old name
    });
    await tick(0);

    expect(screen.getByText("Renamed.pdf")).toBeInTheDocument();
    expectCompletelyGone("keep.pdf");
  });

  it("still takes a document's status from the server after a rename", async () => {
    respond({
      "PATCH /api/backend/documents/p": () => ok(doc("processing", "p", "Renamed busy.pdf")),
      "GET /api/backend/documents": () => ok([doc("ready", "p", "busy.pdf"), doc("ready", "r", "keep.pdf")]),
    });
    render(<DocumentUpload initialDocuments={withTwo()} />);

    await rename("busy.pdf", "Renamed busy.pdf");
    await tick(POLL_INTERVAL_MS);

    // The name is the one just chosen, but it finished reading, so it is now a link.
    expect(screen.getByRole("link", { name: /Renamed busy\.pdf/ })).toBeInTheDocument();
  });

  it("stops holding on to a rename after a minute, so a change made elsewhere shows up", async () => {
    respond({
      "PATCH /api/backend/documents/r": () => ok(doc("ready", "r", "Renamed here.pdf")),
      "GET /api/backend/documents": () =>
        ok([doc("processing", "p", "busy.pdf"), doc("ready", "r", "Renamed elsewhere.pdf")]),
    });
    render(<DocumentUpload initialDocuments={withTwo()} />);

    await rename("keep.pdf", "Renamed here.pdf");
    await tick(61_000);

    expect(screen.getByText("Renamed elsewhere.pdf")).toBeInTheDocument();
  });

  it("shows a changed kind on the row", async () => {
    respond({ "PATCH /api/backend/documents/r": () => ok(doc("ready", "r", "keep.pdf", { doc_type: "lease" })) });
    render(<DocumentUpload initialDocuments={withTwo()} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit keep.pdf" }));
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "lease" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await tick(0);

    expect(screen.getByRole("link", { name: /keep\.pdf/ })).toHaveTextContent("Lease");
  });
});
