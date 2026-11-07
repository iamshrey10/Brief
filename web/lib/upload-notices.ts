import { failureMessage, isInProgress, type DocumentSummary } from "@/lib/documents";

/** What the person is told about a document they just added, and when. */
export type Notice = {
  kind: "reading" | "ready" | "failed" | "request";
  title: string;
  body?: string;
  /** A link to open, or a button that does something, offered under the message. */
  action?: { label: string; href: string } | { label: string; run: "retry"; documentId: string };
  /** Milliseconds until it goes away by itself, or null when it stays until it is dismissed. */
  closeAfterMs: number | null;
};

export const READING_HINT = "Short files take seconds, long ones a minute or two.";

/** The note shown when documents are added. More than one at a time is said once, with the count. */
export function addedNotice(filenames: string[]): Notice {
  const many = filenames.length > 1;
  return {
    kind: "reading",
    title: many ? `Added ${filenames.length} documents` : `Added ${filenames[0]}`,
    body: `${many ? "Reading them now." : "Reading it now."} ${READING_HINT}`,
    closeAfterMs: 7000,
  };
}

export type Settled = {
  notices: Notice[];
  stillWatching: Set<string>;
  /** Ids of the documents announced as ready in this look, and of those that failed. */
  readyIds: string[];
  failedIds: string[];
  /** Documents that have been read but whose summary and questions have not been prepared yet, so they are not called ready. */
  toPrepare: DocumentSummary[];
  changed: boolean;
};

/** The note shown while a document that has been read gets its key terms and questions worked out. */
export function preparingNotice(filenames: string[]): Notice {
  const many = filenames.length > 1;
  return {
    kind: "reading",
    title: many ? `Preparing ${filenames.length} documents` : `Preparing ${filenames[0]}`,
    body: "Finding the key terms and the questions to ask. Almost there.",
    closeAfterMs: null,
  };
}

/**
 * Given the ids being watched and the list as it is now, says what to tell the person and which ids are still being read.
 * A document counts as ready only once its summary has been prepared, so what the note promises is there when it is opened.
 * Documents that are ready are said together, so three finishing at once is one note and not three. A document that
 * failed gets its own note with a way to try again, because each one needs its own try. A document that is no longer in
 * the list (it was deleted) is quietly forgotten.
 */
export function settle(watching: Set<string>, fresh: DocumentSummary[], prepared: Set<string> = new Set()): Settled {
  const byId = new Map(fresh.map((document) => [document.id, document]));
  const stillWatching = new Set<string>();
  const ready: DocumentSummary[] = [];
  const failed: DocumentSummary[] = [];
  const toPrepare: DocumentSummary[] = [];
  for (const id of watching) {
    const document = byId.get(id);
    if (!document) continue;
    if (isInProgress(document.status)) stillWatching.add(id);
    else if (document.status === "failed") failed.push(document);
    else if (!prepared.has(id)) {
      // Read, but the overview is not worked out yet. It is not called ready until it is, so opening it never shows a wait.
      stillWatching.add(id);
      toPrepare.push(document);
    } else ready.push(document);
  }

  const notices: Notice[] = [];
  if (ready.length === 1) {
    const [document] = ready;
    const hard = document.status === "needs_retake";
    notices.push({
      kind: "ready",
      title: `${document.filename} is ready`,
      body: hard ? "The scan was hard to read, so some answers may be missing. A clearer copy would help." : undefined,
      action: { label: "View document", href: `/dashboard/documents/${document.id}` },
      closeAfterMs: 10000,
    });
  } else if (ready.length > 1) {
    notices.push({
      kind: "ready",
      title: `${ready.length} documents are ready`,
      action: { label: "View documents", href: "/dashboard/documents" },
      closeAfterMs: 10000,
    });
  }
  for (const document of failed) {
    notices.push({
      kind: "failed",
      title: `We couldn't read ${document.filename}`,
      body: failureMessage(document) ?? undefined,
      action: { label: "Try again", run: "retry", documentId: document.id },
      closeAfterMs: null,
    });
  }
  return { notices, stillWatching, toPrepare, readyIds: ready.map((document) => document.id), failedIds: failed.map((document) => document.id), changed: ready.length + failed.length > 0 || stillWatching.size !== watching.size };
}

/** The note shown when someone has used a share link and code and is waiting to be let in. */
export function requestNotice(who: string): Notice {
  return {
    kind: "request",
    title: `${who} asked to see your dashboard`,
    body: "Nothing is shared until you approve it.",
    action: { label: "Review", href: "/dashboard/shared#sharing" },
    closeAfterMs: 12000,
  };
}
