import { describe, expect, it } from "vitest";

import type { DocumentSummary } from "@/lib/documents";
import { addedNotice, preparingNotice, READING_HINT, settle } from "@/lib/upload-notices";

const doc = (id: string, status: string, extra: Partial<DocumentSummary> = {}): DocumentSummary => ({
  id,
  filename: `${id}.pdf`,
  doc_type: "lease",
  status,
  ocr_confidence: null,
  ...extra,
});

describe("addedNotice", () => {
  it("names the file and says how long reading takes, honestly", () => {
    const notice = addedNotice(["offer.pdf"]);

    expect(notice).toMatchObject({ kind: "reading", title: "Added offer.pdf", closeAfterMs: 7000 });
    expect(notice.body).toBe(`Reading it now. ${READING_HINT}`);
  });

  it("says the count once when several are added", () => {
    const notice = addedNotice(["a.pdf", "b.pdf", "c.pdf"]);

    expect(notice.title).toBe("Added 3 documents");
    expect(notice.body).toMatch(/^Reading them now\./);
  });
});

describe("settle", () => {
  it("says nothing while documents are still being read, and keeps watching them", () => {
    const result = settle(new Set(["a", "b"]), [doc("a", "processing"), doc("b", "uploaded")]);

    expect(result.notices).toEqual([]);
    expect([...result.stillWatching]).toEqual(["a", "b"]);
    expect(result.changed).toBe(false);
  });

  it("tells the person one document is ready, with a link straight to it that stays about ten seconds", () => {
    const result = settle(new Set(["a"]), [doc("a", "ready")], new Set(["a"]));

    expect(result.notices).toEqual([
      { kind: "ready", title: "a.pdf is ready", body: undefined, action: { label: "View document", href: "/dashboard/documents/a" }, closeAfterMs: 10000 },
    ]);
    expect(result.stillWatching.size).toBe(0);
    expect(result.changed).toBe(true);
  });

  it("groups several that finish together into one note that links to the list", () => {
    const result = settle(new Set(["a", "b", "c"]), [doc("a", "ready"), doc("b", "ready"), doc("c", "ready")], new Set(["a", "b", "c"]));

    expect(result.notices).toHaveLength(1);
    expect(result.notices[0]).toMatchObject({ title: "3 documents are ready", action: { label: "View documents", href: "/dashboard/documents" } });
  });

  it("says plainly when a scan was hard to read", () => {
    const [notice] = settle(new Set(["a"]), [doc("a", "needs_retake")], new Set(["a"])).notices;

    expect(notice.title).toBe("a.pdf is ready");
    expect(notice.body).toMatch(/hard to read/);
  });

  it("gives each failed document its own note with the reason and a way to try again, which stays until dismissed", () => {
    const result = settle(new Set(["a", "b"]), [doc("a", "failed", { failure_reason: "no_text" }), doc("b", "failed")]);

    expect(result.notices).toHaveLength(2);
    expect(result.notices[0]).toMatchObject({
      kind: "failed",
      title: "We couldn't read a.pdf",
      action: { label: "Try again", run: "retry", documentId: "a" },
      closeAfterMs: null,
    });
    expect(result.notices[0].body).toMatch(/No text could be found/);
    expect(result.notices[1].body).toMatch(/Something went wrong/);
  });

  it("reports ready and failed together, and keeps watching the rest", () => {
    const result = settle(new Set(["a", "b", "c"]), [doc("a", "ready"), doc("b", "failed"), doc("c", "processing")], new Set(["a"]));

    expect(result.notices.map((notice) => notice.kind)).toEqual(["ready", "failed"]);
    expect([...result.stillWatching]).toEqual(["c"]);
  });

  it("does not call a document ready until its summary is prepared, and asks for it to be prepared", () => {
    const waiting = settle(new Set(["a"]), [doc("a", "ready")]);

    expect(waiting.notices).toEqual([]);
    expect([...waiting.stillWatching]).toEqual(["a"]);
    expect(waiting.toPrepare.map((document) => document.id)).toEqual(["a"]);

    const done = settle(new Set(["a"]), [doc("a", "ready")], new Set(["a"]));
    expect(done.notices).toHaveLength(1);
    expect(done.toPrepare).toEqual([]);
  });

  it("quietly forgets a document that is no longer in the list", () => {
    const result = settle(new Set(["gone"]), [doc("other", "ready")]);

    expect(result.notices).toEqual([]);
    expect(result.stillWatching.size).toBe(0);
    expect(result.changed).toBe(true);
  });

  it("ignores documents that were not being watched", () => {
    expect(settle(new Set(), [doc("a", "ready")]).notices).toEqual([]);
  });
});

describe("preparingNotice", () => {
  it("says the summary is being worked out, and stays until it is done", () => {
    expect(preparingNotice(["a.pdf"])).toMatchObject({ kind: "reading", title: "Preparing a.pdf", closeAfterMs: null });
    expect(preparingNotice(["a.pdf", "b.pdf"]).title).toBe("Preparing 2 documents");
  });
});
