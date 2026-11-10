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

/**
 * A question for each fact Brief pulls out of a document (the stable names in the API's key term fields). A suggestion is
 * offered only when that fact was found in this very document, so the answer is there and cites a clause.
 */
export const QUESTION_FOR_TERM: Record<string, string> = {
  // loan
  principal_amount: "How much am I borrowing?",
  interest_rate: "What is the interest rate, and how is it worked out?",
  rate_type: "Is the rate fixed, or can it change?",
  loan_term: "How long do I have to repay it?",
  repayment_start: "When do I have to start repaying?",
  monthly_payment: "How do my monthly payments work?",
  origination_fee: "What is the origination fee?",
  late_fee: "What is the late fee?",
  prepayment_penalty: "Is there a fee for paying it off early?",
  cosigner: "What is the cosigner responsible for?",
  default_terms: "What counts as default?",
  // lease
  property_address: "Which property does this cover?",
  lease_start: "When does the lease start?",
  lease_end: "When does the lease end?",
  monthly_rent: "How much is the monthly rent?",
  security_deposit: "How does the security deposit work?",
  nonrefundable_fees: "Which fees will I not get back?",
  utilities: "Which utilities do I pay for?",
  early_termination: "What happens if I leave early?",
  renewal: "How does the lease renew, and what notice is needed?",
  // job offer
  job_title: "What role is being offered?",
  start_date: "When is my start date?",
  base_salary: "What is the base salary, and how often is it paid?",
  bonus: "Is there a bonus?",
  equity: "Is any stock or equity offered?",
  benefits: "What benefits are included?",
  at_will: "Can either side end the job at any time?",
  non_compete: "Does it limit where I can work after I leave?",
  repayment_clause: "Do I have to repay anything if I leave?",
  // other
  parties: "Who is this agreement between?",
  effective_date: "When does it take effect?",
  term: "How long does it last?",
  payments: "What payments does it require, and when?",
  termination: "How can it be ended?",
  penalties: "What penalties does it mention?",
};

// What matters most to least, per kind: money first, then leaving or changing, then the rest. The first few that were found are used.
const PRIORITY: Record<string, string[]> = {
  loan: ["monthly_payment", "interest_rate", "prepayment_penalty", "late_fee", "repayment_start", "loan_term", "origination_fee", "default_terms", "cosigner", "rate_type", "principal_amount"],
  lease: ["monthly_rent", "security_deposit", "early_termination", "late_fee", "renewal", "lease_end", "utilities", "nonrefundable_fees", "lease_start", "property_address"],
  offer: ["base_salary", "benefits", "repayment_clause", "non_compete", "at_will", "bonus", "equity", "start_date", "job_title"],
  other: ["payments", "termination", "penalties", "term", "effective_date", "parties"],
};

export const FROM_DOCUMENT_MAX = 4;
export const FROM_DOCUMENT_MIN = 2;

/**
 * Questions about what was actually found in this document, most important first, or null when fewer than two facts were
 * found, so the general questions for its kind are shown instead.
 */
export function suggestionsFromTerms(docType: string | undefined, terms: { name: string; found: boolean }[]): string[] | null {
  const found = new Set(terms.filter((term) => term.found).map((term) => term.name));
  const order = PRIORITY[docType ?? "other"] ?? PRIORITY.other;
  const questions = order.filter((name) => found.has(name) && QUESTION_FOR_TERM[name]).map((name) => QUESTION_FOR_TERM[name]);
  return questions.length >= FROM_DOCUMENT_MIN ? questions.slice(0, FROM_DOCUMENT_MAX) : null;
}
