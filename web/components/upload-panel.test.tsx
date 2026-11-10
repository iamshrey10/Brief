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

  it("offers to photograph a paper contract with the phone's back camera, and a photo is treated like any chosen file", () => {
    render(<UploadPanel onUploaded={vi.fn()} />);

    const camera = screen.getByLabelText("Take a photo of a paper contract");
    expect(camera).toHaveAttribute("capture", "environment");
    expect(camera).toHaveAttribute("accept", "image/*");

    fireEvent.change(camera, { target: { files: [new File(["jpeg"], "image.jpg", { type: "image/jpeg" })] } });

    expect(screen.getByText("image.jpg")).toBeInTheDocument();
    expect(screen.queryByLabelText("Take a photo of a paper contract")).toBeNull();
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

  it("files an upload in the folder for its kind unless one is chosen, and says so when it is unsure", async () => {
    render(<UploadPanel onUploaded={() => {}} />);

    expect(screen.getByLabelText("Folder")).toHaveValue("");
    expect(screen.queryByText(/Not sure where this belongs/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Other/));
    expect(screen.getByText(/Not sure where this belongs, so it goes in Other/)).toBeInTheDocument();

    choose();
    fireEvent.click(screen.getByRole("button", { name: /upload|add|send/i }));
    await tick();

    const body = JSON.parse(fetchMock.mock.calls.find(([url, init]) => url === "/api/backend/documents" && init?.method === "POST")![1].body);
    expect(body).not.toHaveProperty("folder");
  });

  it("sends the folder that was chosen, and stops saying it is unsure", async () => {
    render(<UploadPanel onUploaded={() => {}} />);
    fireEvent.click(screen.getByLabelText(/Other/));
    fireEvent.change(screen.getByLabelText("Folder"), { target: { value: "Personal_Documents" } });
    expect(screen.queryByText(/Not sure where this belongs/)).not.toBeInTheDocument();

    choose();
    fireEvent.click(screen.getByRole("button", { name: /upload|add|send/i }));
    await tick();

    const body = JSON.parse(fetchMock.mock.calls.find(([url, init]) => url === "/api/backend/documents" && init?.method === "POST")![1].body);
    expect(body).toMatchObject({ doc_type: "other", folder: "Personal_Documents" });
  });
});

describe("the kind of document, guessed from the file name", () => {
  const pick = (name: string) => fireEvent.change(screen.getByLabelText("Choose a file to upload"), { target: { files: [new File(["%PDF-1.4"], name, { type: "application/pdf" })] } });
  const radio = (name: string) => screen.getByRole("radio", { name });
  const sentKind = () => JSON.parse((fetchMock.mock.calls.find(([url]) => url === "/api/backend/documents")![1] as RequestInit).body as string).doc_type;

  it("starts with no kind chosen, so nothing is labelled wrongly", () => {
    render(<UploadPanel onUploaded={vi.fn()} />);

    for (const name of ["Education loan", "Lease", "Job offer", "Other"]) expect(radio(name)).not.toBeChecked();
  });

  it("chooses the kind the name points to, says it was a guess, and sends that kind", async () => {
    render(<UploadPanel onUploaded={vi.fn()} />);

    pick("2-job-offer-letter.pdf");

    expect(radio("Job offer")).toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("Guessed from the file name. Change it if it is wrong.");
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await tick();
    expect(sentKind()).toBe("offer");
  });

  it("chooses nothing when the name says nothing, asks for a choice, and keeps Upload off until there is one", async () => {
    render(<UploadPanel onUploaded={vi.fn()} />);

    pick("IMG_2041.pdf");

    for (const name of ["Education loan", "Lease", "Job offer", "Other"]) expect(radio(name)).not.toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("Choose what kind of document it is");
    expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();

    fireEvent.click(radio("Lease"));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await tick();
    expect(sentKind()).toBe("lease");
  });

  it("lets the person change a guess, and then leaves their choice alone for the next file", () => {
    render(<UploadPanel onUploaded={vi.fn()} />);
    pick("my-loan.pdf");
    fireEvent.click(radio("Other"));

    expect(radio("Other")).toBeChecked();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove my-loan.pdf" }));
    pick("rental-agreement.pdf");

    expect(radio("Other")).toBeChecked();
  });

  it("lets the next file's name replace an earlier guess, and clears a guess when the file is removed", () => {
    render(<UploadPanel onUploaded={vi.fn()} />);
    pick("my-loan.pdf");
    expect(radio("Education loan")).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Remove my-loan.pdf" }));
    expect(radio("Education loan")).not.toBeChecked();
    pick("rental-agreement.pdf");
    expect(radio("Lease")).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Remove rental-agreement.pdf" }));
    pick("IMG_1.pdf");

    expect(radio("Lease")).not.toBeChecked();
  });

  it("does not guess when the name points two ways", () => {
    render(<UploadPanel onUploaded={vi.fn()} />);

    pick("lease-or-loan.pdf");

    for (const name of ["Education loan", "Lease", "Job offer", "Other"]) expect(radio(name)).not.toBeChecked();
  });

  it("starts the next upload with nothing chosen again", async () => {
    render(<UploadPanel onUploaded={vi.fn()} />);
    pick("my-loan.pdf");
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await tick();

    for (const name of ["Education loan", "Lease", "Job offer", "Other"]) expect(radio(name)).not.toBeChecked();
  });
});
