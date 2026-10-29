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

/** The line above the documents: "2 documents" and, when there are some, how they divide by kind. */
export function summaryLine(documents: { doc_type: string }[]): string {
  if (documents.length === 0) return "No documents yet";
  const total = `${documents.length} ${documents.length === 1 ? "document" : "documents"}`;
  const kinds = countByKind(documents).map(({ label, count }) => `${count} ${label.toLowerCase()}`);
  return `${total}: ${kinds.join(", ")}`;
}
