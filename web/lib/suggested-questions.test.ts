import { describe, expect, it } from "vitest";

import { DOC_TYPE_LABELS } from "./documents";
import { FROM_DOCUMENT_MAX, QUESTION_FOR_TERM, SUGGESTED_QUESTIONS, suggestionsFor, suggestionsFromTerms } from "./suggested-questions";

describe("suggested questions", () => {
  it("has three for every kind of document the site knows", () => {
    for (const kind of Object.keys(DOC_TYPE_LABELS)) expect(SUGGESTED_QUESTIONS[kind]).toHaveLength(3);
  });

  it("gives the general ones for a kind it does not know, or none given", () => {
    expect(suggestionsFor("passport")).toEqual(SUGGESTED_QUESTIONS.other);
    expect(suggestionsFor(undefined)).toEqual(SUGGESTED_QUESTIONS.other);
  });

  it("gives the lease ones for a lease", () => {
    expect(suggestionsFor("lease")[0]).toContain("payments");
  });

  it("keeps every question short, ending in a question mark, with no em dash", () => {
    for (const question of Object.values(SUGGESTED_QUESTIONS).flat()) {
      expect(question.length).toBeLessThanOrEqual(70);
      expect(question.endsWith("?")).toBe(true);
      expect(question).not.toContain("—");
    }
  });
});

// The fact names the API pulls out of each kind of document (api/app/key_term_fields.py). A fact that names only a person or
// a company has no question, since asking who the lender is adds nothing the overview does not already show.
const API_FIELDS: Record<string, string[]> = {
  loan: ["lender", "borrower", "principal_amount", "interest_rate", "rate_type", "loan_term", "repayment_start", "monthly_payment", "origination_fee", "late_fee", "prepayment_penalty", "cosigner", "default_terms"],
  lease: ["landlord", "tenant", "property_address", "lease_start", "lease_end", "monthly_rent", "security_deposit", "nonrefundable_fees", "late_fee", "utilities", "early_termination", "renewal"],
  offer: ["employer", "job_title", "start_date", "base_salary", "bonus", "equity", "benefits", "at_will", "non_compete", "repayment_clause"],
  other: ["parties", "effective_date", "term", "payments", "termination", "penalties"],
};
const NAMES_ONLY = new Set(["lender", "borrower", "landlord", "tenant", "employer"]);

describe("suggestions from what was found in the document", () => {
  const terms = (found: string[], all = API_FIELDS.loan) => all.map((name) => ({ name, found: found.includes(name) }));

  it("has a short question for every fact the API pulls out, except those that only name someone", () => {
    for (const names of Object.values(API_FIELDS)) {
      for (const name of names) {
        if (NAMES_ONLY.has(name)) expect(QUESTION_FOR_TERM[name]).toBeUndefined();
        else {
          const question = QUESTION_FOR_TERM[name];
          expect(question, name).toBeTruthy();
          expect(question.length).toBeLessThanOrEqual(70);
          expect(question.endsWith("?")).toBe(true);
          expect(question).not.toContain("—");
        }
      }
    }
  });

  it("asks only about what was found, most important first", () => {
    const questions = suggestionsFromTerms("loan", terms(["late_fee", "monthly_payment", "cosigner"]));

    expect(questions).toEqual(["How do my monthly payments work?", "What is the late fee?", "What is the cosigner responsible for?"]);
  });

  it("never offers a question about something that was not found", () => {
    const questions = suggestionsFromTerms("loan", terms(["monthly_payment", "interest_rate"]))!;

    expect(questions.join(" ")).not.toMatch(/early|late fee|cosigner/i);
  });

  it("offers at most four, and is the same for a lease, a job offer and any other kind", () => {
    for (const [kind, names] of Object.entries(API_FIELDS)) {
      const questions = suggestionsFromTerms(kind, terms(names, names))!;
      expect(questions.length).toBe(FROM_DOCUMENT_MAX);
      expect(new Set(questions).size).toBe(FROM_DOCUMENT_MAX);
    }
    expect(suggestionsFromTerms("lease", terms(["security_deposit", "monthly_rent", "renewal"], API_FIELDS.lease))![0]).toBe("How much is the monthly rent?");
    expect(suggestionsFromTerms("offer", terms(["benefits", "base_salary"], API_FIELDS.offer))).toEqual(["What is the base salary, and how often is it paid?", "What benefits are included?"]);
  });

  it("gives nothing when fewer than two facts were found, so the general questions are used", () => {
    expect(suggestionsFromTerms("loan", terms([]))).toBeNull();
    expect(suggestionsFromTerms("loan", terms(["monthly_payment"]))).toBeNull();
    expect(suggestionsFromTerms("loan", terms(["lender", "borrower"]))).toBeNull();
  });

  it("uses the general order for a kind it does not know, and ignores facts it has no question for", () => {
    expect(suggestionsFromTerms("passport", [{ name: "payments", found: true }, { name: "term", found: true }, { name: "mystery", found: true }])).toEqual(["What payments does it require, and when?", "How long does it last?"]);
    expect(suggestionsFromTerms(undefined, [{ name: "payments", found: true }, { name: "termination", found: true }])).toHaveLength(2);
  });
});
