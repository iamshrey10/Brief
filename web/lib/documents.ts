export type DocumentSummary = {
  id: string;
  filename: string;
  doc_type: string;
  status: string;
  ocr_confidence: number | null;
  // When it was uploaded, as an ISO timestamp. Absent on older responses.
  created_at?: string | null;
  // When its status last changed. What "stuck" is measured from, so a document that was just
  // retried is not stuck because it was uploaded long ago. Absent on older rows.
  status_changed_at?: string | null;
};

export type ClauseData = {
  id: string;
  clause_index: number;
  page_number: number;
  text: string;
};

/** The clause and quoted words a reader picked from an answer's citations. */
export type ActiveCitation = { clauseId: string; quote: string };

export const DOC_TYPE_LABELS: Record<string, string> = {
  loan: "Education loan",
  lease: "Lease",
  offer: "Job offer",
  other: "Other",
};

/**
 * A document can be read and asked about once ingestion has produced clauses, which
 * includes a poorly scanned one. Mirrors SEARCHABLE_STATUSES in api/app/main.py, the
 * backend refuses to answer questions for any other status.
 */
export function isReadable(status: string): boolean {
  return status === "ready" || status === "needs_retake";
}

/** Statuses a document passes through before it is either readable or has failed. */
export function isInProgress(status: string): boolean {
  return status === "pending" || status === "uploaded" || status === "processing";
}

/** Plain-language labels, so the raw database status never reaches the reader. */
export function statusLabel(status: string): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "needs_retake":
      return "Hard to read";
    case "failed":
      return "Couldn't read";
    case "pending":
      return "Uploading";
    case "uploaded":
    case "processing":
      return "Processing";
    default:
      return status;
  }
}

// While something is still processing the dashboard re-checks on this interval, and stops
// after the cap, so a document stuck in processing can't make a tab poll forever.
export const POLL_INTERVAL_MS = 3000;
export const MAX_POLL_DURATION_MS = 5 * 60 * 1000;

export type PageGroup = { pageNumber: number; clauses: ClauseData[] };

/** Groups clauses by page, keeping the order the backend returned them in. */
export function groupByPage(clauses: ClauseData[]): PageGroup[] {
  const groups: PageGroup[] = [];
  for (const clause of clauses) {
    const last = groups[groups.length - 1];
    if (last && last.pageNumber === clause.page_number) {
      last.clauses.push(clause);
    } else {
      groups.push({ pageNumber: clause.page_number, clauses: [clause] });
    }
  }
  return groups;
}

/**
 * When a document was uploaded, in words a person says: "today", "yesterday", "Oct 3", or
 * "Oct 3, 2025" for another year. Calendar days are compared in the reader's own time zone, so
 * something uploaded late last night reads "yesterday", not "today". Returns an empty string
 * when the date is missing or unreadable, so the caller can simply leave it out.
 */
export function formatUploaded(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const uploaded = new Date(iso);
  if (Number.isNaN(uploaded.getTime())) return "";

  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysAgo = Math.round(
    (startOfDay(now).getTime() - startOfDay(uploaded).getTime()) / 86_400_000,
  );
  if (daysAgo === 0) return "today";
  if (daysAgo === 1) return "yesterday";

  const sameYear = uploaded.getFullYear() === now.getFullYear();
  return uploaded.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/** The types the backend accepts, and the file extensions that identify each one. */
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
};

export const ACCEPTED_FILE_TYPES = Array.from(new Set(Object.values(CONTENT_TYPE_BY_EXTENSION)));

/**
 * The content type to upload a file as, or null if it is not a kind Brief can read. The browser's
 * own type is trusted when it is one we accept. Some files, HEIC photos especially, arrive with
 * no type at all, so fall back to the extension rather than guessing it is a PDF.
 */
export function contentTypeFor(file: { name: string; type: string }): string | null {
  if (ACCEPTED_FILE_TYPES.includes(file.type)) return file.type;
  if (file.type !== "") return null;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPE_BY_EXTENSION[extension] ?? null;
}

/** A file size a person reads easily: "850 KB", "2.4 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Puts a document first, replacing any earlier version of it already in the list. */
export function putFirst(list: DocumentSummary[], document: DocumentSummary): DocumentSummary[] {
  return [document, ...list.filter((existing) => existing.id !== document.id)];
}

/**
 * Combines the page's own list with a fresh one from the server. The server is right about every
 * document it returns, but a refresh that started before an upload can come back without the new
 * document, so anything only the page knows about stays in front instead of vanishing until the
 * next refresh. Each document appears once.
 */
export function mergeFresh(local: DocumentSummary[], fresh: DocumentSummary[]): DocumentSummary[] {
  const known = new Set(fresh.map((document) => document.id));
  return [...local.filter((document) => !known.has(document.id)), ...fresh];
}

/** Mirrors STUCK_AFTER in api/app/main.py: still being read this long after upload means stuck. */
export const STUCK_AFTER_MS = 15 * 60 * 1000;

/**
 * Whether a document can be read again: it failed, or it has been stuck being read for a long
 * time, measured from when its status last changed and, for older rows, from the upload. Mirrors
 * what the backend allows, which is the real rule. This only decides whether to show the button.
 * A document with no usable time at all is never treated as stuck.
 */
export function canRetry(document: DocumentSummary, now: Date = new Date()): boolean {
  if (document.status === "failed") return true;
  const since = document.status_changed_at ?? document.created_at;
  if (!isInProgress(document.status) || !since) return false;
  const started = new Date(since).getTime();
  return !Number.isNaN(started) && now.getTime() - started > STUCK_AFTER_MS;
}

/** Swaps in a newer version of a document, keeping its place in the list. */
export function replaceDocument(
  list: DocumentSummary[],
  updated: DocumentSummary,
): DocumentSummary[] {
  return list.map((existing) => (existing.id === updated.id ? updated : existing));
}
