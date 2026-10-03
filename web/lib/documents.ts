export type DocumentSummary = {
  id: string;
  filename: string;
  doc_type: string;
  status: string;
  ocr_confidence: number | null;
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
