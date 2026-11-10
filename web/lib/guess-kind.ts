/** The kinds of document Brief can read, as the upload form names them. */
export type GuessedKind = "loan" | "lease" | "offer";

// Words that point to one kind. Only whole words are matched, after the name is split at spaces, dashes, dots, underscores,
// digits and changes of case, so "current" is not "rent" and "IMG_2041" says nothing.
const WORDS: Record<GuessedKind, string[]> = {
  loan: ["loan", "loans", "promissory", "tuition", "borrower", "financing"],
  lease: ["lease", "leases", "leasing", "sublease", "rental", "rent", "tenancy", "tenant", "landlord"],
  offer: ["offer", "offers", "employment", "job", "salary", "compensation"],
};

function wordsOf(filename: string): string[] {
  const base = filename.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  return base
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/**
 * What kind of document a file is, judged only from its name, or null when the name does not say or points two ways.
 * It is a first guess for the person to confirm or change, never a decision made for them.
 */
export function guessDocKind(filename: string): GuessedKind | null {
  const words = new Set(wordsOf(filename));
  const found = (Object.keys(WORDS) as GuessedKind[]).filter((kind) => WORDS[kind].some((word) => words.has(word)));
  return found.length === 1 ? found[0] : null;
}
