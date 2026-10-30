/** Questions to start with, by kind of document, shown as buttons before the first question is asked. */
export const SUGGESTED_QUESTIONS: Record<string, string[]> = {
  lease: [
    "How much is the security deposit, and when do I get it back?",
    "What happens if I pay rent late?",
    "Can I end the lease early?",
  ],
  loan: [
    "What is the interest rate, and can it change?",
    "Is there a fee for paying the loan off early?",
    "When do I have to start repaying?",
  ],
  offer: [
    "What is the base salary?",
    "Do I have to pay back a bonus if I leave?",
    "How much notice do I have to give?",
  ],
  other: [
    "What are the key dates in this document?",
    "What fees or payments does it mention?",
    "How can this agreement be ended?",
  ],
};

/** The suggestions for a kind of document, or the general ones for a kind not listed. */
export function suggestionsFor(docType: string | undefined): string[] {
  return SUGGESTED_QUESTIONS[docType ?? "other"] ?? SUGGESTED_QUESTIONS.other;
}
