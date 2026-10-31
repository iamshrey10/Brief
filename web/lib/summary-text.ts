import type { ChecklistResult, KeyTermsResult } from "@/lib/overview";

const KIND_NAMES: Record<string, string> = { lease: "lease", loan: "education loan", offer: "job offer", other: "agreement" };

export type SummaryFormat = "text" | "markdown";

/**
 * A plain summary of what Brief found in a document, to paste into a message or keep as a file: the terms it found,
 * the ones the document does not mention, and the questions the document leaves open with wording to ask them.
 * It holds no file name and no quotes, only what is shown on the Overview, and it ends by saying it is not legal advice.
 * The checklist may be missing (it failed to load), in which case the questions are simply left out.
 */
export function buildSummary(
  docType: string,
  keyTerms: KeyTermsResult,
  checklist: ChecklistResult | null,
  format: SummaryFormat = "text",
): string {
  const kind = KIND_NAMES[docType] ?? KIND_NAMES.other;
  const md = format === "markdown";
  const heading = (text: string, level = 2) => (md ? `${"#".repeat(level)} ${text}` : text.toUpperCase());
  const bullet = (text: string) => `${md ? "-" : "*"} ${text}`;
  const lines: string[] = [heading(`Summary of my ${kind}, from Brief`, 1), ""];

  const found = keyTerms.terms.filter((term) => term.found && term.value);
  const missing = keyTerms.terms.filter((term) => !term.found);
  if (found.length > 0) {
    lines.push(heading("Key terms"));
    for (const term of found) {
      const page = term.page_number ? ` (page ${term.page_number})` : "";
      lines.push(bullet(`${term.label}: ${term.value}${page}`));
    }
    lines.push("");
  }
  if (missing.length > 0) {
    lines.push(heading("Not mentioned in the document"));
    lines.push(bullet(missing.map((term) => term.label).join(", ")));
    lines.push("");
  }

  const open = (checklist?.answers ?? []).filter((answer) => answer.status === "not_mentioned" && answer.gap && answer.ask_them);
  if (open.length > 0) {
    lines.push(heading("Questions to ask before signing"));
    open.forEach((answer, index) => lines.push(`${index + 1}. ${answer.ask_them}`));
    lines.push("");
  }

  if (keyTerms.truncated || checklist?.truncated) {
    lines.push("Note: the document was too long to read in full, so something marked as not mentioned may be in the part that was not read.", "");
  }
  lines.push("Explained by Brief. This is an explanation of the document, not legal advice. Check everything against the document itself.");
  return lines.join("\n") + "\n";
}
