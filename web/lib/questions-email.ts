import type { ChecklistAnswer } from "@/lib/overview";

const SUBJECTS: Record<string, { subject: string; about: string }> = {
  lease: { subject: "Questions about the lease before I sign", about: "the lease" },
  loan: { subject: "Questions about the loan before I sign", about: "the loan" },
  offer: { subject: "Questions about the job offer", about: "the offer" },
  other: { subject: "Questions about the agreement before I sign", about: "the agreement" },
};

/** Browsers and mail programs cut off a very long link, so the email keeps to what fits. */
export const MAX_MAILTO_LENGTH = 1800;

export type QuestionsEmail = {
  subject: string;
  body: string;
  /** A link that opens a new message in the person's own mail program. Nothing is sent by Brief. */
  href: string;
  included: number;
  total: number;
};

function bodyFor(about: string, questions: string[]): string {
  const list = questions.map((question, index) => `${index + 1}. ${question}`).join("\n");
  return `Hello,\n\nBefore I sign, I have a few questions about ${about}:\n\n${list}\n\nThank you,\n`;
}

function linkFor(subject: string, body: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body).replaceAll("%0A", "%0D%0A")}`;
}

/**
 * An email of the questions the document leaves open, worded as Brief's "Ask them" lines, most important first.
 * It holds only those words: no file name, no quote and nothing from the contract. Null when there is nothing to ask.
 * When the questions are too many for one link it keeps the first ones, and `included` says how many.
 */
export function buildQuestionsEmail(docType: string, answers: ChecklistAnswer[]): QuestionsEmail | null {
  const questions = answers
    .filter((answer) => answer.status === "not_mentioned" && answer.gap && answer.ask_them)
    .map((answer) => answer.ask_them as string);
  if (questions.length === 0) return null;

  const { subject, about } = SUBJECTS[docType] ?? SUBJECTS.other;
  let included = questions.length;
  let body = bodyFor(about, questions);
  while (included > 1 && linkFor(subject, body).length > MAX_MAILTO_LENGTH) {
    included -= 1;
    body = bodyFor(about, questions.slice(0, included));
  }
  return { subject, body, href: linkFor(subject, body), included, total: questions.length };
}
