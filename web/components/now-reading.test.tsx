// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/overview", () => ({ fetchKeyTerms: vi.fn().mockResolvedValue({ ok: true }), fetchChecklist: vi.fn().mockResolvedValue({ ok: true }) }));

import type { DocumentSummary } from "@/lib/documents";
import { NowReading } from "./now-reading";
import { UploadNotifications, useUploadNotifications } from "./upload-notifications";

const doc = (id: string, status: string, extra: Partial<DocumentSummary> = {}): DocumentSummary => ({ id, filename: `${id}.pdf`, doc_type: "lease", status, ocr_confidence: null, ...extra });

function Adder({ documents }: { documents: DocumentSummary[] }) {
  const { uploaded } = useUploadNotifications();
  return (
    <button type="button" onClick={() => documents.forEach(uploaded)}>
      add
    </button>
  );
}

const listIs = (documents: DocumentSummary[]) => vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => documents }));
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function show(documents: DocumentSummary[]) {
  render(
    <UploadNotifications>
      <Adder documents={documents} />
      <NowReading />
    </UploadNotifications>,
  );
  fireEvent.click(screen.getByRole("button", { name: "add" }));
}

describe("NowReading", () => {
  it("shows nothing when nothing is being read", () => {
    listIs([]);
    render(
      <UploadNotifications>
        <NowReading />
      </UploadNotifications>,
    );

    expect(screen.queryByRole("region", { name: "Now reading" })).not.toBeInTheDocument();
  });

  it("shows the four steps for a document being read, with the part it is on and the current step marked", () => {
    listIs([doc("lease", "processing")]);
    show([doc("lease", "processing", { progress_done: 3, progress_total: 10 })]);

    const region = screen.getByRole("region", { name: "Now reading" });
    expect(within(region).getByText("lease.pdf")).toBeInTheDocument();
    expect(within(region).getByText("Reading part 3 of 10")).toBeInTheDocument();
    const steps = within(region).getByRole("list", { name: "Steps for lease.pdf" });
    const items = within(steps).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent("Uploaded (done)");
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(items[1]).toHaveTextContent("Reading the document (now)");
    expect(items[2]).not.toHaveAttribute("aria-current");
    expect(within(region).queryByRole("link", { name: "View document" })).not.toBeInTheDocument();
  });

  it("says it is sending the file while that is happening", () => {
    listIs([]);
    show([doc("lease", "pending")]);

    expect(screen.getByText("Sending your file")).toBeInTheDocument();
  });

  it("moves to preparing the summary when the reading is done, then ticks the last step and offers the document, then goes", async () => {
    listIs([doc("lease", "processing")]);
    show([doc("lease", "processing")]);

    listIs([doc("lease", "ready")]);
    await tick(3100);
    await tick(100);

    const region = screen.getByRole("region", { name: "Now reading" });
    expect(within(region).getByRole("link", { name: "View document" })).toHaveAttribute("href", "/dashboard/documents/lease");
    expect(within(region).getByRole("list", { name: "Steps for lease.pdf" })).toHaveTextContent("Ready (done)");

    await tick(12100);
    expect(screen.queryByRole("region", { name: "Now reading" })).not.toBeInTheDocument();
  });

  it("shows the first few documents and counts the rest", () => {
    listIs([]);
    show([doc("a", "processing"), doc("b", "processing"), doc("c", "processing"), doc("d", "processing"), doc("e", "processing")]);

    const region = screen.getByRole("region", { name: "Now reading" });
    expect(within(region).getAllByText(/\.pdf$/)).toHaveLength(3);
    expect(within(region).getByText("And 2 more being read.")).toBeInTheDocument();
  });

  describe("on a phone", () => {
    const scrollIntoView = vi.fn();
    const setWidth = (phone: boolean) =>
      vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("max-width: 639px") ? phone : false, media: query, addEventListener() {}, removeEventListener() {} }));

    beforeEach(() => {
      scrollIntoView.mockClear();
      Element.prototype.scrollIntoView = scrollIntoView;
    });

    it("brings the card into view when the first document starts being read, since it sits above the Upload button", () => {
      listIs([doc("lease", "processing")]);
      setWidth(true);
      show([doc("lease", "processing")]);

      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    });

    it("does not move the page on a laptop", () => {
      listIs([doc("lease", "processing")]);
      setWidth(false);
      show([doc("lease", "processing")]);

      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it("is placed first on a phone, above the upload box", () => {
      listIs([doc("lease", "processing")]);
      setWidth(true);
      show([doc("lease", "processing")]);

      expect(screen.getByRole("region", { name: "Now reading" })).toHaveClass("max-sm:order-first");
    });
  });
});
