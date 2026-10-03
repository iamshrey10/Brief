export type TextSegment = { text: string; highlighted: boolean };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Splits `text` into segments so the part matching `quote` can be highlighted.
 *
 * This matches the rule the backend used to verify the citation in the first place
 * (api/app/qa.py), ignore case, treat any run of whitespace as equal, and ignore quote
 * marks wrapped around the quote. It has to be as forgiving as that check, because the
 * clause text keeps the PDF's own line breaks, so a quote the backend accepted would
 * otherwise fail to highlight.
 *
 * Only the first match is highlighted. If nothing matches, the whole text comes back as
 * one plain segment. The segments always join back into exactly the original text.
 */
export function splitByQuote(text: string, quote: string): TextSegment[] {
  const words = quote
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return [{ text, highlighted: false }];

  const match = new RegExp(words.map(escapeRegExp).join("\\s+"), "i").exec(text);
  if (!match) return [{ text, highlighted: false }];

  const start = match.index;
  const end = start + match[0].length;
  const segments: TextSegment[] = [];
  if (start > 0) segments.push({ text: text.slice(0, start), highlighted: false });
  segments.push({ text: match[0], highlighted: true });
  if (end < text.length) segments.push({ text: text.slice(end), highlighted: false });
  return segments;
}
