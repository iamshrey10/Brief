/** Three starting questions per kind of document, one about money, one about duties and dates, one about leaving or changing it, shown as buttons before the first question is asked. */
export const SUGGESTED_QUESTIONS: Record<string, string[]> = {
  lease: [
    "What payments do I owe, and when are they due?",
    "What am I responsible for during this agreement?",
    "What are my options for ending it early?",
  ],
  loan: [
    "What will this cost me in total, including interest and fees?",
    "What are my repayment obligations and deadlines?",
    "What happens if I pay late or want to pay it off early?",
  ],
  offer: [
    "What compensation and benefits are included?",
    "What do I have to do, and by when, to accept?",
    "What are the terms if I leave or the offer ends?",
  ],
  other: [
    "What payments or fees does this document mention?",
    "What are my main obligations and key dates?",
    "How can this agreement be changed or ended?",
  ],
};

/** The suggestions for a kind of document, or the general ones for a kind not listed. */
export function suggestionsFor(docType: string | undefined): string[] {
  return SUGGESTED_QUESTIONS[docType ?? "other"] ?? SUGGESTED_QUESTIONS.other;
}
