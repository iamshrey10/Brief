/** The address that opens the tour: the welcome page sends new people here, and Profile offers it again to anyone. */
export const TOUR_URL = "/dashboard?tour=1";

/** One step of the guided tour. A step with a `path` belongs to that page and a `target` is the part of it to point at. */
export type TourStep = {
  id: string;
  title: string;
  body: string;
  /** A few short things to look for, shown as a list under the text. */
  points?: string[];
  /** The page this step is about. Moving to the step takes the person there. Without one, the step stays wherever they are. */
  path?: string;
  /** The `data-tour` name of the part of the page to point at, found on the page the step belongs to. */
  target?: string;
};

/** The tour, in the order it is told: what Brief is, each part of it on its own page, then keeping the account safe. */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to Brief",
    body: "Brief reads a lease, a loan or a job offer and explains it clause by clause, with the exact words behind every answer. This short tour points at each part. It stays open as you move around, and closes only when you close it.",
    path: "/dashboard",
  },
  {
    id: "add",
    title: "Add a document",
    body: "Drop in a PDF, or take a photo of the pages on your phone. Say what kind of document it is and press Upload.",
    path: "/dashboard/documents",
    target: "upload",
  },
  {
    id: "sample",
    title: "No contract handy?",
    body: "Try a sample lease. Brief loads a made up one, reads it, and you can see everything it does in a few seconds.",
    path: "/dashboard/documents",
    target: "sample",
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
    path: "/dashboard/shared",
    target: "sharing",
  },
  {
    id: "bin",
    title: "The Bin keeps your mistakes safe",
    body: "A document you delete goes to the Bin and stays for 7 days. Open it here to restore one, or delete it for good.",
    path: "/dashboard/profile",
    target: "bin",
  },
  {
    id: "safe",
    title: "Keep your account safe",
    body: "Two-step verification adds a second lock: a 6 digit code from an authenticator app. It is optional and takes a minute. You can take this tour again any time from Profile.",
    path: "/dashboard/profile",
    target: "two-step",
  },
] as const;
