import type { ChecklistResult, KeyTermsResult } from "@/lib/overview";

const KIND_NAMES: Record<string, string> = { lease: "lease", loan: "education loan", offer: "job offer", other: "agreement" };

/** One piece of the summary, before it is written out as text, Markdown or a PDF. */
export type SummaryBlock =
  | { kind: "title" | "heading" | "paragraph" | "note"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "numbered"; number: number; text: string };

/**
 * What a summary says, as blocks: the terms Brief found, the ones the document does not mention, and the questions it
 * leaves open with wording to ask them. It holds no file name and no quotes, only what is shown on the Overview, and it
 * ends by saying it is not legal advice. The checklist may be missing (it failed to load), in which case the questions
 * are simply left out.
 */
export function summaryBlocks(docType: string, keyTerms: KeyTermsResult, checklist: ChecklistResult | null): SummaryBlock[] {
  const kind = KIND_NAMES[docType] ?? KIND_NAMES.other;
  const blocks: SummaryBlock[] = [{ kind: "title", text: `Summary of my ${kind}, from Brief` }];

  const found = keyTerms.terms.filter((term) => term.found && term.value);
  const missing = keyTerms.terms.filter((term) => !term.found);
  if (found.length > 0) {
    blocks.push({ kind: "heading", text: "Key terms" });
    for (const term of found) {
      const page = term.page_number ? ` (page ${term.page_number})` : "";
      blocks.push({ kind: "bullet", text: `${term.label}: ${term.value}${page}` });
    }
  }
  if (missing.length > 0) {
    blocks.push({ kind: "heading", text: "Not mentioned in the document" });
    blocks.push({ kind: "bullet", text: missing.map((term) => term.label).join(", ") });
  }

  const open = (checklist?.answers ?? []).filter((answer) => answer.status === "not_mentioned" && answer.gap && answer.ask_them);
  if (open.length > 0) {
    blocks.push({ kind: "heading", text: "Questions to ask before signing" });
    open.forEach((answer, index) => blocks.push({ kind: "numbered", number: index + 1, text: answer.ask_them as string }));
  }

  if (keyTerms.truncated || checklist?.truncated) {
    blocks.push({
      kind: "note",
      text: "The document was too long to read in full, so something marked as not mentioned may be in the part that was not read.",
    });
  }
  blocks.push({
    kind: "paragraph",
    text: "Explained by Brief. This is an explanation of the document, not legal advice. Check everything against the document itself.",
  });
  return blocks;
}

/** The summary written out as plain text, to paste into a message. */
export function buildSummary(docType: string, keyTerms: KeyTermsResult, checklist: ChecklistResult | null): string {
  const lines: string[] = [];
  const blankLine = () => {
    if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
  };
  for (const block of summaryBlocks(docType, keyTerms, checklist)) {
    switch (block.kind) {
      case "title":
        lines.push(block.text.toUpperCase(), "");
        break;
      case "heading":
        blankLine();
        lines.push(block.text.toUpperCase());
        break;
      case "bullet":
        lines.push(`* ${block.text}`);
        break;
      case "numbered":
        lines.push(`${block.number}. ${block.text}`);
        break;
      case "note":
        blankLine();
        lines.push(`Note: ${block.text}`);
        break;
      case "paragraph":
        blankLine();
        lines.push(block.text);
        break;
    }
  }
  return lines.join("\n") + "\n";
}
