import { DOC_TYPE_LABELS } from "@/lib/documents";

export type KindCount = { kind: string; label: string; count: number };

/** How many documents there are of each kind, in the fixed order of the kind labels, leaving out kinds with none. */
export function countByKind(documents: { doc_type: string }[]): KindCount[] {
  const order = Object.keys(DOC_TYPE_LABELS);
  const counts = new Map<string, number>();
  for (const { doc_type } of documents) counts.set(doc_type, (counts.get(doc_type) ?? 0) + 1);
  // A kind this site does not know yet is still counted, after the known ones, under its own name.
  const kinds = [...order, ...[...counts.keys()].filter((kind) => !order.includes(kind))];
  return kinds
    .filter((kind) => counts.has(kind))
    .map((kind) => ({ kind, label: DOC_TYPE_LABELS[kind] ?? kind, count: counts.get(kind) ?? 0 }));
}

/** The line above the documents: how many there are, with the count in the right number. */
export function summaryLine(documents: { doc_type: string }[]): string {
  if (documents.length === 0) return "No documents yet";
  return `${documents.length} ${documents.length === 1 ? "document" : "documents"}`;
}

/** The documents whose name contains the search (ignoring case and spaces at either end) and, unless kind is "all", are of that kind. */
export function filterDocuments<T extends { filename: string; doc_type: string }>(
  documents: T[],
  search: string,
  kind: string,
): T[] {
  const needle = search.trim().toLowerCase();
  return documents.filter(
    (document) =>
      (kind === "all" || document.doc_type === kind) && (!needle || document.filename.toLowerCase().includes(needle)),
  );
}
