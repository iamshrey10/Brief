/** Why someone came to Brief, as the welcome page asks it. These four words are what the server accepts and counts. */
export type SignupReason = "lease" | "loan" | "job_offer" | "exploring";

export type ReasonChoice = { value: SignupReason; title: string; hint: string };

export const REASONS: readonly ReasonChoice[] = [
  { value: "lease", title: "Check a lease", hint: "Deposit, rent rules, and ending early" },
  { value: "loan", title: "Understand a loan", hint: "Rates, fees, and what a missed payment costs" },
  { value: "job_offer", title: "Review a job offer", hint: "Notice period, non-competes, and the fine print" },
  { value: "exploring", title: "Just looking around", hint: "See how Brief reads a contract, with a sample" },
];
