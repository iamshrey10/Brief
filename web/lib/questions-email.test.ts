import { describe, expect, it } from "vitest";

import type { ChecklistAnswer } from "./overview";
import { buildQuestionsEmail, MAX_MAILTO_LENGTH } from "./questions-email";

const answer = (id: string, over: Partial<ChecklistAnswer> = {}): ChecklistAnswer => ({
  id,
  question: `Question ${id}?`,
  why_it_matters: "w",
  importance: "high",
  status: "not_mentioned",
  answer: null,
  evidence: [],
  gap: true,
  ask_them: `Wording for ${id}?`,
  ...over,
});

describe("buildQuestionsEmail", () => {
  const email = buildQuestionsEmail("lease", [answer("renewal"), answer("pets")])!;

  it("has a subject for the kind of document, and a numbered list of the wording", () => {
    expect(email.subject).toBe("Questions about the lease before I sign");
    expect(email.body).toBe(
      "Hello,\n\nBefore I sign, I have a few questions about the lease:\n\n1. Wording for renewal?\n2. Wording for pets?\n\nThank you,\n",
    );
    expect([email.included, email.total]).toEqual([2, 2]);
  });

  it("has a subject for each kind, and a general one for a kind it does not know", () => {
    expect(buildQuestionsEmail("loan", [answer("a")])!.subject).toContain("loan");
    expect(buildQuestionsEmail("offer", [answer("a")])!.subject).toContain("job offer");
    expect(buildQuestionsEmail("passport", [answer("a")])!.subject).toContain("agreement");
  });

  it("is a link that opens a new message, with the line breaks as a mail program wants them", () => {
    expect(email.href.startsWith("mailto:?subject=Questions%20about%20the%20lease%20before%20I%20sign&body=")).toBe(true);
    expect(email.href).toContain("%0D%0A");
    expect(email.href).not.toContain("%0A%0A");
    expect(decodeURIComponent(email.href.split("&body=")[1]).replaceAll("\r\n", "\n")).toBe(email.body);
  });

  it("takes only the important questions the document did not answer, and only those with wording", () => {
    const built = buildQuestionsEmail("lease", [
      answer("answered", { status: "answered", gap: false, ask_them: null }),
      answer("minor", { gap: false }),
      answer("no-wording", { ask_them: null }),
      answer("real"),
    ])!;

    expect(built.body).toContain("1. Wording for real?");
    expect(built.body).not.toContain("minor");
    expect(built.total).toBe(1);
  });

  it("is null when there is nothing to ask", () => {
    expect(buildQuestionsEmail("lease", [])).toBeNull();
    expect(buildQuestionsEmail("lease", [answer("a", { gap: false })])).toBeNull();
  });

  it("carries nothing from the contract itself, only the wording to ask", () => {
    const built = buildQuestionsEmail("lease", [answer("a", { evidence: [{ clause_id: "c1", page_number: 1, quote: "SECRET CLAUSE TEXT" }], answer: "SECRET ANSWER" })])!;

    expect(built.body + built.href).not.toContain("SECRET");
  });

  it("keeps the link short enough to open, dropping the last questions and saying how many were kept", () => {
    const many = Array.from({ length: 40 }, (_, i) => answer(String(i), { ask_them: `A fairly long question number ${i} that asks about something in the document in detail?` }));

    const built = buildQuestionsEmail("lease", many)!;

    expect(built.href.length).toBeLessThanOrEqual(MAX_MAILTO_LENGTH);
    expect(built.included).toBeLessThan(40);
    expect(built.included).toBeGreaterThan(5);
    expect(built.total).toBe(40);
    expect(built.body).toContain(`${built.included}. `);
    expect(built.body).not.toContain(`${built.included + 1}. `);
  });
});
