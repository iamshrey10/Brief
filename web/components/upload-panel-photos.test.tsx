// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import type { DocumentSummary } from "@/lib/documents";

const photoToPage = vi.fn();
vi.mock("@/lib/photos-pdf", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/photos-pdf")>()), photoToPage: (...args: unknown[]) => photoToPage(...args) }));

import { UploadPanel } from "./upload-panel";

const CONFIRMED: DocumentSummary = { id: "d9", filename: "contract.pdf", doc_type: "lease", status: "uploaded", ocr_confidence: null };
const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response;
let fetchMock: Mock;

beforeEach(() => {
  vi.useFakeTimers();
  photoToPage.mockReset();
  photoToPage.mockImplementation(async (file: File) => ({ jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9, file.name.length]), width: 3000, height: 4000 }));
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
const photo = (name: string, type = "image/jpeg", size = 1000) => {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
};
const camera = () => screen.getByLabelText(/^(Take a photo of a paper contract|Add another page with the camera)$/);
const gallery = () => screen.getByLabelText(/^(Choose a file to upload|Add more photos)$/);
const shoot = (name: string) => fireEvent.change(camera(), { target: { files: [photo(name)] } });
const pick = (...files: File[]) => fireEvent.change(gallery(), { target: { files } });
const pages = () => within(screen.getByRole("list", { name: /^Pages/ })).getAllByRole("listitem");

describe("adding photos to one document", () => {
  it("adds each photo from the camera as the next page, and offers another page until there are five", () => {
    render(<UploadPanel onUploaded={vi.fn()} />);

    shoot("one.jpg");
    expect(screen.queryByRole("list", { name: /^Pages/ })).toBeNull();
    expect(screen.getByText("Add photos (1 of 5)")).toBeInTheDocument();
    shoot("two.jpg");
    shoot("three.jpg");

    expect(pages()).toHaveLength(3);
    expect(pages().map((row) => within(row).getByText(/^Page \d$/).textContent)).toEqual(["Page 1", "Page 2", "Page 3"]);
    expect(screen.getByText(/These 3 photos become one document, with a page for each/)).toBeInTheDocument();
    expect(screen.getByText("Add photos (3 of 5)")).toBeInTheDocument();
  });

  it("takes several photos at once from the gallery", () => {
    render(<UploadPanel onUploaded={vi.fn()} />);

    pick(photo("a.jpg"), photo("b.png", "image/png"), photo("c.heic", "image/heic"));

    expect(pages()).toHaveLength(3);
  });

  it("stops at five photos, and says that the rest were left out", () => {
    render(<UploadPanel onUploaded={vi.fn()} />);

    pick(photo("1.jpg"), photo("2.jpg"), photo("3.jpg"), photo("4.jpg"));
    pick(photo("5.jpg"), photo("6.jpg"), photo("7.jpg"));

    expect(pages()).toHaveLength(5);
    expect(screen.getByText("Up to 5 photos make one document, so the rest were left out.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Add more photos")).toBeNull();
    expect(screen.queryByLabelText("Add another page with the camera")).toBeNull();
  });

  it("refuses several files when one of them is not a photo, and keeps what was chosen", () => {
    render(<UploadPanel onUploaded={vi.fn()} />);
    pick(photo("a.jpg"));

    pick(photo("b.jpg"), new File(["%PDF"], "c.pdf", { type: "application/pdf" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Several files at once can only be photos. A PDF is uploaded on its own.");
    expect(screen.getByText("a.jpg")).toBeInTheDocument();
  });

  it("lets a PDF replace the photos, because a PDF is uploaded on its own", () => {
    render(<UploadPanel onUploaded={vi.fn()} />);
    pick(photo("a.jpg"), photo("b.jpg"));

    fireEvent.click(screen.getByRole("button", { name: "Remove page 1, a.jpg" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove b.jpg" }));
    fireEvent.change(gallery(), { target: { files: [new File(["%PDF"], "lease.pdf", { type: "application/pdf" })] } });

    expect(screen.getByText("lease.pdf")).toBeInTheDocument();
    expect(screen.queryByText("Add photos (1 of 5)")).toBeNull();
  });

  it("refuses a file that is not a PDF or a photo, and one over the size limit", () => {
    render(<UploadPanel onUploaded={vi.fn()} />);

    pick(photo("notes.txt", "text/plain"));
    expect(screen.getByRole("alert")).toHaveTextContent("isn't supported");

    pick(photo("huge.jpg", "image/jpeg", 51 * 1024 * 1024));
    expect(screen.getByRole("alert")).toHaveTextContent("larger than the 50 MB limit");
  });

  it("refuses photos that are over the limit together, though each is under it", () => {
    render(<UploadPanel onUploaded={vi.fn()} />);

    pick(photo("a.jpg", "image/jpeg", 30 * 1024 * 1024), photo("b.jpg", "image/jpeg", 30 * 1024 * 1024));

    expect(screen.getByRole("alert")).toHaveTextContent("Those photos together are larger than the 50 MB limit.");
  });

  it("moves a page earlier or later, and the first cannot go earlier or the last later", () => {
    render(<UploadPanel onUploaded={vi.fn()} />);
    pick(photo("a.jpg"), photo("b.jpg"), photo("c.jpg"));

    expect(screen.getByRole("button", { name: "Move page 1 earlier" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move page 3 later" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Move page 3 earlier" }));

    expect(pages().map((row) => within(row).getByText(/\.jpg$/).textContent)).toEqual(["a.jpg", "c.jpg", "b.jpg"]);
    fireEvent.click(screen.getByRole("button", { name: "Move page 1 later" }));
    expect(pages().map((row) => within(row).getByText(/\.jpg$/).textContent)).toEqual(["c.jpg", "a.jpg", "b.jpg"]);
  });

  it("removes a page, and is back to the drop area when the last one goes", () => {
    render(<UploadPanel onUploaded={vi.fn()} />);
    pick(photo("a.jpg"), photo("b.jpg"));

    fireEvent.click(screen.getByRole("button", { name: "Remove page 1, a.jpg" }));
    expect(screen.getByText("b.jpg")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove b.jpg" }));

    expect(screen.getByText(/drop a contract here/i)).toBeInTheDocument();
  });

  it("puts several photos together as one PDF in the order shown, and uploads that one file", async () => {
    const onUploaded = vi.fn();
    render(<UploadPanel onUploaded={onUploaded} />);
    pick(photo("a.jpg"), photo("bb.jpg"), photo("ccc.jpg"));
    fireEvent.click(screen.getByRole("button", { name: "Move page 3 earlier" }));
    fireEvent.click(screen.getByRole("radio", { name: "Lease" }));

    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await tick();
    await tick();

    expect(photoToPage.mock.calls.map(([file]) => (file as File).name)).toEqual(["a.jpg", "ccc.jpg", "bb.jpg"]);
    const create = fetchMock.mock.calls.find(([url]) => url === "/api/backend/documents")!;
    const sent = JSON.parse((create[1] as RequestInit).body as string);
    expect(sent.content_type).toBe("application/pdf");
    expect(sent.filename).toMatch(/^contract-photos-\d{4}-\d{2}-\d{2}-3-pages\.pdf$/);
    expect(sent.doc_type).toBe("lease");
    const put = fetchMock.mock.calls.find(([url]) => url === "https://storage.example/upload")!;
    const body = (put[1] as RequestInit).body as File;
    expect(body.type).toBe("application/pdf");
    expect(sent.file_size_bytes).toBe(body.size);
    expect(onUploaded).toHaveBeenCalledWith(CONFIRMED);
    expect(screen.getByText(/drop a contract here/i)).toBeInTheDocument();
  });

  it("says that it is putting the photos together while it does", async () => {
    let finish: (value: unknown) => void = () => {};
    photoToPage.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    render(<UploadPanel onUploaded={vi.fn()} />);
    pick(photo("a.jpg"), photo("b.jpg"));
    fireEvent.click(screen.getByRole("radio", { name: "Lease" }));

    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await tick();

    expect(screen.getByText("Putting your photos together...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Uploading..." })).toBeDisabled();
    finish({ jpeg: new Uint8Array([1]), width: 10, height: 10 });
  });

  it("says so, and sends nothing, when the browser cannot open one of the photos", async () => {
    photoToPage.mockRejectedValue(new Error("cannot decode"));
    render(<UploadPanel onUploaded={vi.fn()} />);
    pick(photo("a.heic", "image/heic"), photo("b.jpg"));
    fireEvent.click(screen.getByRole("radio", { name: "Lease" }));

    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await tick();

    expect(screen.getByRole("alert")).toHaveTextContent("One of those photos could not be opened here");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("a.heic")).toBeInTheDocument();
  });

  it("uploads a single photo as the photo itself, not as a PDF", async () => {
    render(<UploadPanel onUploaded={vi.fn()} />);
    pick(photo("page.jpg"));
    fireEvent.click(screen.getByRole("radio", { name: "Lease" }));

    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await tick();

    expect(photoToPage).not.toHaveBeenCalled();
    const create = fetchMock.mock.calls.find(([url]) => url === "/api/backend/documents")!;
    expect(JSON.parse((create[1] as RequestInit).body as string).content_type).toBe("image/jpeg");
  });

  it("does not guess the kind from the name when there are several photos", () => {
    render(<UploadPanel onUploaded={vi.fn()} />);

    pick(photo("lease-page-1.jpg"), photo("lease-page-2.jpg"));

    expect(screen.getByText(/Choose what kind of document it is/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
  });
});

describe("the small pictures of the photos", () => {
  it("draws each photo small and shows it, and keeps an icon when the browser cannot open the photo", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn(async (file: File) => {
      if (file.name === "broken.jpg") throw new Error("cannot decode");
      return { width: 400, height: 300, close };
    }));
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,AAAA");
    const { container } = render(<UploadPanel onUploaded={vi.fn()} />);

    pick(photo("good.jpg"), photo("broken.jpg"));
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));

    const pictures = container.querySelectorAll("li img");
    expect(pictures).toHaveLength(1);
    expect(pictures[0]).toHaveAttribute("src", "data:image/jpeg;base64,AAAA");
    expect(pictures[0]).toHaveAttribute("alt", "");
    // Cropped to a square from the middle of a 400 by 300 photo, and the photo released afterwards.
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 50, 0, 300, 300, 0, 0, 96, 96);
    expect(close).toHaveBeenCalled();
    expect(container.querySelectorAll("li > span[aria-hidden] svg, li span[aria-hidden]").length).toBeGreaterThan(0);
    vi.restoreAllMocks();
  });

  it("shows no picture for a PDF, only an icon", () => {
    const { container } = render(<UploadPanel onUploaded={vi.fn()} />);

    fireEvent.change(gallery(), { target: { files: [new File(["%PDF"], "lease.pdf", { type: "application/pdf" })] } });

    expect(container.querySelectorAll("li img")).toHaveLength(0);
    expect(screen.getByText("lease.pdf")).toBeInTheDocument();
  });
});
