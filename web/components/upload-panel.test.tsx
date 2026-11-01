// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import type { DocumentSummary } from "@/lib/documents";
import { UploadPanel } from "./upload-panel";

const CONFIRMED: DocumentSummary = { id: "d9", filename: "loan.pdf", doc_type: "loan", status: "uploaded", ocr_confidence: null };
const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response;
let fetchMock: Mock;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/backend/documents" && init?.method === "POST") return ok({ document_id: "d9", upload_url: "https://storage.example/upload" });
    if (url === "https://storage.example/upload") return { ok: true } as Response;
    if (url.endsWith("/confirm")) return ok(CONFIRMED);
    throw new Error(`unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const tick = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)));
const choose = () =>
  fireEvent.change(screen.getByLabelText("Choose a file to upload"), { target: { files: [new File(["%PDF-1.4"], "loan.pdf", { type: "application/pdf" })] } });

describe("the upload panel", () => {
  it("hands the accepted document to whoever shows it, once, and empties the form", async () => {
    const onUploaded = vi.fn();
    render(<UploadPanel onUploaded={onUploaded} />);

    choose();
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await tick();

    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(onUploaded).toHaveBeenCalledWith(CONFIRMED);
    expect(screen.getByText(/drop a contract here/i)).toBeInTheDocument();
  });

  it("tells nobody about a document that was refused, and shows why", async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 400, json: async () => ({ detail: "file is too large, 50MB max" }) }) as Response);
    const onUploaded = vi.fn();
    render(<UploadPanel onUploaded={onUploaded} />);

    choose();
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await tick();

    expect(onUploaded).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("hands over the sample lease too, as a lease", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/samples/sample-lease.pdf") return { ok: true, blob: async () => new Blob(["%PDF-1.4"]) } as Response;
      if (url === "/api/backend/documents" && init?.method === "POST") {
        expect(JSON.parse(init.body as string)).toMatchObject({ filename: "sample-lease.pdf", doc_type: "lease" });
        return ok({ document_id: "d9", upload_url: "https://storage.example/upload" });
      }
      if (url === "https://storage.example/upload") return { ok: true } as Response;
      return ok({ ...CONFIRMED, filename: "sample-lease.pdf", doc_type: "lease" });
    });
    const onUploaded = vi.fn();
    render(<UploadPanel onUploaded={onUploaded} />);

    fireEvent.click(screen.getByRole("button", { name: "Try a sample lease" }));
    await tick();

    expect(onUploaded).toHaveBeenCalledWith(expect.objectContaining({ filename: "sample-lease.pdf", doc_type: "lease" }));
  });

  it("turns away a file of a kind it cannot read before anything is sent", () => {
    render(<UploadPanel onUploaded={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Choose a file to upload"), { target: { files: [new File(["x"], "a.gif", { type: "image/gif" })] } });

    expect(screen.getByRole("alert")).toHaveTextContent("isn't supported");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
