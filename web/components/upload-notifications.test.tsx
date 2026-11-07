// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentSummary } from "@/lib/documents";
import { UploadNotifications, useUploadNotifications } from "./upload-notifications";
import { stepOf } from "@/lib/tracking";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const keyTermsMock = vi.fn();
const checklistMock = vi.fn();
vi.mock("@/lib/overview", () => ({ fetchKeyTerms: (id: string) => keyTermsMock(id), fetchChecklist: (id: string) => checklistMock(id) }));
const retryMock = vi.fn();
vi.mock("@/lib/retry", () => ({ retryDocument: (id: string) => retryMock(id) }));

const doc = (id: string, status: string, extra: Partial<DocumentSummary> = {}): DocumentSummary => ({
  id,
  filename: `${id}.pdf`,
  doc_type: "offer",
  status,
  ocr_confidence: null,
  ...extra,
});

function Adder({ documents }: { documents: DocumentSummary[] }) {
  const notifications = useUploadNotifications();
  return (
    <button type="button" onClick={() => documents.forEach((document) => notifications.uploaded(document))}>
      add
    </button>
  );
}

function listIs(documents: DocumentSummary[]) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => documents }));
}

async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockClear();
  retryMock.mockReset();
  keyTermsMock.mockReset().mockResolvedValue({ ok: true });
  checklistMock.mockReset().mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderWith(documents: DocumentSummary[]) {
  render(
    <UploadNotifications>
      <Adder documents={documents} />
    </UploadNotifications>,
  );
  fireEvent.click(screen.getByRole("button", { name: "add" }));
}

describe("UploadNotifications", () => {
  it("says a document was added and how long reading takes, then goes away by itself", async () => {
    listIs([doc("offer", "processing")]);
    renderWith([doc("offer", "processing")]);

    expect(screen.getByRole("status")).toHaveTextContent("Added offer.pdf");
    expect(screen.getByRole("status")).toHaveTextContent("Short files take seconds, long ones a minute or two.");

    await tick(7100);
    expect(screen.queryByText("Added offer.pdf")).not.toBeInTheDocument();
  });

  it("says the count once when several are added together", () => {
    listIs([]);
    renderWith([doc("a", "processing"), doc("b", "processing")]);

    expect(screen.getByText("Added 2 documents")).toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("says nothing more while the document is still being read", async () => {
    listIs([doc("offer", "processing")]);
    renderWith([doc("offer", "processing")]);

    await tick(3100);

    expect(screen.queryByText(/is ready/)).not.toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("when it is ready, replaces the first note with one that links to the document, and refreshes the page behind", async () => {
    listIs([doc("offer", "ready")]);
    renderWith([doc("offer", "processing")]);

    await tick(3100); // read, summary being prepared
    await tick(3100); // prepared, so now it is ready

    expect(screen.getByText("offer.pdf is ready")).toBeInTheDocument();
    expect(screen.queryByText("Added offer.pdf")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View document" })).toHaveAttribute("href", "/dashboard/documents/offer");
    expect(refresh).toHaveBeenCalledTimes(1);

    await tick(10100); // it stays about ten seconds
    expect(screen.queryByText("offer.pdf is ready")).not.toBeInTheDocument();
  });

  it("groups several ready at once into one note", async () => {
    listIs([doc("a", "ready"), doc("b", "ready"), doc("c", "ready")]);
    renderWith([doc("a", "processing"), doc("b", "processing"), doc("c", "processing")]);

    await tick(3100);
    await tick(3100);

    expect(screen.getByText("3 documents are ready")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View documents" })).toHaveAttribute("href", "/dashboard/documents");
  });

  it("tells the person when a document could not be read, with the reason, and keeps the note until it is dismissed", async () => {
    listIs([doc("offer", "failed", { failure_reason: "no_text" })]);
    renderWith([doc("offer", "processing")]);

    await tick(3100);
    await tick(60000);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("We couldn't read offer.pdf");
    expect(alert).toHaveTextContent("No text could be found");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("Try again asks for another read, then says it is reading again and watches for the result", async () => {
    listIs([doc("offer", "failed")]);
    retryMock.mockResolvedValue({ ok: true, document: doc("offer", "processing") });
    renderWith([doc("offer", "processing")]);
    await tick(3100);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });

    expect(retryMock).toHaveBeenCalledWith("offer");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Reading offer.pdf again")).toBeInTheDocument();

    listIs([doc("offer", "ready")]);
    await tick(3100);
    await tick(3100);
    expect(screen.getByText("offer.pdf is ready")).toBeInTheDocument();
  });

  it("does not say ready while the summary is still being prepared, and says so, then says ready once it is", async () => {
    let finish!: (value: { ok: true }) => void;
    keyTermsMock.mockReturnValue(new Promise((done) => (finish = done)));
    listIs([doc("offer", "ready")]);
    renderWith([doc("offer", "processing")]);

    await tick(3100);
    await tick(30000);

    expect(screen.getByText("Preparing offer.pdf")).toBeInTheDocument();
    expect(screen.queryByText(/is ready/)).not.toBeInTheDocument();
    expect(keyTermsMock).toHaveBeenCalledTimes(1); // asked once, not on every look
    expect(checklistMock).toHaveBeenCalledWith("offer");

    await act(async () => finish({ ok: true }));
    await tick(3100);

    expect(screen.getByText("offer.pdf is ready")).toBeInTheDocument();
    expect(screen.queryByText("Preparing offer.pdf")).not.toBeInTheDocument();
  });

  it("when trying again is refused, says why in the same note", async () => {
    listIs([doc("offer", "failed")]);
    retryMock.mockResolvedValue({ ok: false, message: "Too many requests at once. Wait a few seconds and try again." });
    renderWith([doc("offer", "processing")]);
    await tick(3100);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Too many requests at once");
  });

  it("holds a note still while it is hovered, and lets it go after", async () => {
    listIs([doc("offer", "processing")]);
    renderWith([doc("offer", "processing")]);
    const note = screen.getByRole("status");

    fireEvent.mouseEnter(note);
    await tick(20000);
    expect(screen.getByText("Added offer.pdf")).toBeInTheDocument();

    fireEvent.mouseLeave(note);
    await tick(7100);
    expect(screen.queryByText("Added offer.pdf")).not.toBeInTheDocument();
  });

  it("shows a count in the tab title while the tab is hidden, and puts the title back on return", async () => {
    document.title = "Dashboard | Brief";
    listIs([doc("offer", "ready")]);
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    renderWith([doc("offer", "processing")]);

    await tick(3100);
    await tick(3100);
    expect(document.title).toBe("(1) Ready | Dashboard | Brief");

    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(document.title).toBe("Dashboard | Brief");
  });

  it("labels the notes region so screen readers announce them politely without taking focus", () => {
    listIs([]);
    renderWith([doc("offer", "processing")]);

    expect(screen.getByRole("region", { name: "Notifications" })).toBeInTheDocument();
    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "Dismiss" }));
  });

  it("also holds a note still while it has the keyboard focus", async () => {
    listIs([doc("offer", "processing")]);
    renderWith([doc("offer", "processing")]);
    const note = screen.getByRole("status");

    fireEvent.focus(note);
    await tick(20000);
    expect(screen.getByText("Added offer.pdf")).toBeInTheDocument();

    fireEvent.blur(note);
    await tick(7100);
    expect(screen.queryByText("Added offer.pdf")).not.toBeInTheDocument();
  });

  it("stops looking at a document that is still being read after five minutes", async () => {
    listIs([doc("offer", "processing")]);
    renderWith([doc("offer", "processing")]);
    await tick(3100);
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;

    const documentCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/documents")).length;
    await tick(5 * 60 * 1000 + 10000);
    const callsAtGiveUp = documentCalls();
    await tick(30000);

    expect(documentCalls()).toBe(callsAtGiveUp);
  });

  it("says nothing when the list cannot be fetched, and tries again on the next look", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false, json: async () => [] }));
    renderWith([doc("offer", "processing")]);
    await tick(3100);

    expect(screen.queryByText(/is ready|couldn't read/)).not.toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("leaves the tab title alone while the tab is still hidden", async () => {
    document.title = "Dashboard | Brief";
    listIs([doc("offer", "ready")]);
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    renderWith([doc("offer", "processing")]);
    await tick(3100);
    await tick(3100);
    const counted = document.title;

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(document.title).toBe(counted);
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
  });

  it("counts every document when several are ready while the tab is hidden", async () => {
    document.title = "Dashboard | Brief";
    listIs([doc("a", "ready"), doc("b", "ready")]);
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    renderWith([doc("a", "processing"), doc("b", "processing")]);

    await tick(3100);
    await tick(3100);

    expect(document.title).toBe("(2) Ready | Dashboard | Brief");
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
  });

  it("follows the documents being read for the timeline, through to ready, and lets go of them a little after", async () => {
    function Timeline() {
      const { tracked } = useUploadNotifications();
      return <p data-testid="timeline">{tracked.map((entry) => `${entry.document.id}:${stepOf(entry)}`).join(",")}</p>;
    }
    listIs([doc("offer", "processing")]);
    render(
      <UploadNotifications>
        <Adder documents={[doc("offer", "processing")]} />
        <Timeline />
      </UploadNotifications>,
    );
    fireEvent.click(screen.getByRole("button", { name: "add" }));
    expect(screen.getByTestId("timeline")).toHaveTextContent("offer:1");

    listIs([doc("offer", "ready")]);
    await tick(3100); // read, being prepared
    expect(screen.getByTestId("timeline")).toHaveTextContent("offer:3"); // prepared at once in this test, so it is done
    await tick(12100);

    expect(screen.getByTestId("timeline")).toBeEmptyDOMElement();
  });

  it("picks up a document that is still being read after a reload, without saying it was just added", async () => {
    function Timeline() {
      const { tracked } = useUploadNotifications();
      return <p data-testid="timeline">{tracked.map((entry) => entry.document.id).join(",")}</p>;
    }
    listIs([doc("offer", "processing"), doc("old", "ready")]);
    render(
      <UploadNotifications>
        <Timeline />
      </UploadNotifications>,
    );
    await tick(100);

    expect(screen.getByTestId("timeline")).toHaveTextContent("offer");
    expect(screen.getByTestId("timeline")).not.toHaveTextContent("old");
    expect(screen.queryByText(/Added/)).not.toBeInTheDocument();
  });
});

describe("UploadNotifications requests to see the dashboard", () => {
  const share = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
    id,
    label: null,
    status,
    viewer_email: "asha@example.com",
    viewer_name: "Asha Rao",
    created_at: "2026-11-06T00:00:00Z",
    expires_at: null,
    last_viewed_at: null,
    ...extra,
  });

  function Count() {
    const { pendingRequests } = useUploadNotifications();
    return <p data-testid="count">{pendingRequests}</p>;
  }

  function sharesAre(list: unknown[]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => list }));
  }

  it("counts the people waiting to be let in, without a note for those already waiting when the page opened", async () => {
    sharesAre([share("s1", "requested"), share("s2", "active"), share("s3", "invited")]);
    render(
      <UploadNotifications>
        <Count />
      </UploadNotifications>,
    );
    await tick(100);

    expect(screen.getByTestId("count")).toHaveTextContent("1");
    expect(screen.queryByText(/asked to see your dashboard/)).not.toBeInTheDocument();
  });

  it("says so with a note that leads to the answer when someone new asks, and counts them", async () => {
    sharesAre([]);
    render(
      <UploadNotifications>
        <Count />
      </UploadNotifications>,
    );
    await tick(100);
    expect(screen.getByTestId("count")).toHaveTextContent("0");

    sharesAre([share("s1", "requested")]);
    await tick(30100);

    expect(screen.getByTestId("count")).toHaveTextContent("1");
    expect(screen.getByText("Asha Rao asked to see your dashboard")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review" })).toHaveAttribute("href", "/dashboard/shared#sharing");

    await tick(30100); // looked at again: the same person is not announced a second time
    expect(screen.queryAllByText("Asha Rao asked to see your dashboard")).toHaveLength(0); // the first note has gone by itself, and no new one came
  });

  it("names someone by their email, or just says someone, when there is no name", async () => {
    sharesAre([]);
    render(
      <UploadNotifications>
        <Count />
      </UploadNotifications>,
    );
    await tick(100);

    sharesAre([share("s1", "requested", { viewer_name: null }), share("s2", "requested", { viewer_name: null, viewer_email: null })]);
    await tick(30100);

    expect(screen.getByText("asha@example.com asked to see your dashboard")).toBeInTheDocument();
    expect(screen.getByText("Someone asked to see your dashboard")).toBeInTheDocument();
  });

  it("looks again straight away when asked, so the count drops after an answer", async () => {
    function Refresher() {
      const { refreshRequests } = useUploadNotifications();
      return (
        <button type="button" onClick={refreshRequests}>
          refresh
        </button>
      );
    }
    sharesAre([share("s1", "requested")]);
    render(
      <UploadNotifications>
        <Count />
        <Refresher />
      </UploadNotifications>,
    );
    await tick(100);
    expect(screen.getByTestId("count")).toHaveTextContent("1");

    sharesAre([]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "refresh" }));
    });

    expect(screen.getByTestId("count")).toHaveTextContent("0");
  });

  it("keeps the old count when the list cannot be fetched", async () => {
    sharesAre([share("s1", "requested")]);
    render(
      <UploadNotifications>
        <Count />
      </UploadNotifications>,
    );
    await tick(100);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => [] }));
    await tick(30100);
    expect(screen.getByTestId("count")).toHaveTextContent("1");

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await tick(30100);
    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });
});
