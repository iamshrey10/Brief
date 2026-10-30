import { formatUploaded } from "@/lib/documents";

export type DocumentFact = { label: string; value: string };

/** The few facts shown under a document's name: how many clauses and pages it was read into, and when it was uploaded. */
export function documentFacts(
  clauses: { page_number: number }[],
  createdAt: string | null | undefined,
  now: Date = new Date(),
): DocumentFact[] {
  const facts: DocumentFact[] = [];
  if (clauses.length > 0) {
    const pages = new Set(clauses.map((clause) => clause.page_number)).size;
    facts.push({ label: clauses.length === 1 ? "clause" : "clauses", value: String(clauses.length) });
    facts.push({ label: pages === 1 ? "page" : "pages", value: String(pages) });
  }
  const uploaded = formatUploaded(createdAt, now);
  if (uploaded) facts.push({ label: "uploaded", value: uploaded });
  return facts;
}
