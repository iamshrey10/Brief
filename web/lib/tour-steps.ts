/** The address that opens the tour: the welcome page sends new people here, and Profile offers it again to anyone. */
export const TOUR_URL = "/dashboard?tour=1";

/** One card of the first-time tour. A card may offer a button that takes the person to the place it describes. */
export type TourStep = {
  id: string;
  title: string;
  body: string;
  /** A few short things to look for, shown as a list under the text. */
  points?: string[];
  action?: { label: string; href: string };
};

/** The tour, in the order it is told: what Brief is, then each part of it, then keeping the account safe. */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to Brief",
    body: "Brief reads a lease, a loan or a job offer and explains it clause by clause, with the exact words behind every answer. This short tour shows where everything is.",
  },
  {
    id: "add",
    title: "Add a document",
    body: "Drop in a PDF, or take a photo of the pages on your phone. Nothing to hand? Use Try a sample lease and see Brief work in seconds.",
    action: { label: "Go to Documents", href: "/dashboard/documents" },
  },
  {
    id: "overview",
    title: "Your document, explained",
    body: "Open a document and the Overview is built for you, nothing to set up.",
    points: ["Key terms, in plain words", "Key dates, with a reminder you can add", "Before you sign: the questions people most often miss"],
  },
  {
    id: "ask",
    title: "Ask anything about it",
    body: "Use the Ask tab to ask in your own words, such as Can I pay this off early? Every answer points to the clause it came from, and if the document does not cover it, Brief says so instead of guessing.",
  },
  {
    id: "share",
    title: "Share your dashboard",
    body: "Let family or a friend view your documents. You choose how long they can look, from 1 hour up to 90 days, and you can take the access away at any time.",
    action: { label: "Open sharing", href: "/dashboard/shared#sharing" },
  },
  {
    id: "bin",
    title: "The Bin keeps your mistakes safe",
    body: "A document you delete goes to the Bin and stays for 7 days. Restore it from Profile, or delete it for good.",
    action: { label: "Open the Bin", href: "/dashboard/profile#bin" },
  },
  {
    id: "safe",
    title: "Keep your account safe",
    body: "Two-step verification adds a second lock: a 6 digit code from an authenticator app. It is optional and takes a minute. Profile also shows what you have used today.",
    action: { label: "Set up two-step", href: "/dashboard/profile#two-step" },
  },
] as const;
