/** The shortest search that is looked for, so one stray letter does not highlight half the document. */
export const MIN_FIND_LENGTH = 2;

export type FindSegment = { text: string; match: boolean };

/** True when what was typed is long enough to search for. */
export function isSearching(query: string): boolean {
  return query.trim().length >= MIN_FIND_LENGTH;
}

/**
 * Splits text into the parts that match the search and the parts that do not. The match ignores upper and lower case
 * and treats what was typed as plain letters, so a search such as "$1,450" or "(b)" finds exactly that.
 */
export function splitByFind(text: string, query: string): FindSegment[] {
  const needle = query.trim();
  if (needle.length < MIN_FIND_LENGTH) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const target = needle.toLowerCase();
  const segments: FindSegment[] = [];
  let from = 0;
  for (let at = lower.indexOf(target, from); at !== -1; at = lower.indexOf(target, from)) {
    if (at > from) segments.push({ text: text.slice(from, at), match: false });
    segments.push({ text: text.slice(at, at + target.length), match: true });
    from = at + target.length;
  }
  if (from < text.length) segments.push({ text: text.slice(from), match: false });
  return segments.length > 0 ? segments : [{ text, match: false }];
}

/** How many times the search appears in each piece of text, in order. */
export function countMatches(texts: string[], query: string): number[] {
  return texts.map((text) => splitByFind(text, query).filter((segment) => segment.match).length);
}

/** The position of the next match, wrapping from the last to the first and from the first back to the last. */
export function stepMatch(current: number, total: number, direction: 1 | -1): number {
  if (total === 0) return 0;
  return (current + direction + total) % total;
}
