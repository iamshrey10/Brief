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
