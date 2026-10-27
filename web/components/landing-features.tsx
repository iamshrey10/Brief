import type { ReactNode } from "react";

type Feature = { title: string; body: string; icon: ReactNode };

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="h-5 w-5"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** What Brief does today, in the words the rest of the site uses. Nothing here is planned and not built. */
export const FEATURES: Feature[] = [
  {
    title: "The terms that matter, found for you",
    body: "The interest rate, fees, length and dates are pulled out of the document, each one tied to the clause it came from.",
    icon: (
      <Icon>
        <path d="M4 6h16M4 12h10M4 18h7" />
      </Icon>
    ),
  },
  {
    title: "The questions people forget to ask",
    body: "For a loan, a lease or a job offer, Brief answers the questions people most often skip, and flags the ones the document leaves open.",
    icon: (
      <Icon>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01" />
      </Icon>
    ),
  },
  {
    title: "Answers you can check",
    body: "Ask anything about the document. Each answer comes with the exact words it rests on, and a click takes you to them.",
    icon: (
      <Icon>
        <path d="M5 13l4 4L19 7" />
      </Icon>
    ),
  },
];

/** Three things Brief does, as cards. The section's id is what the top bar's link jumps to. */
export function LandingFeatures() {
  return (
    <section id="features" aria-labelledby="features-heading" className="border-t border-border/70 bg-secondary/40">
      <div className="mx-auto w-full max-w-6xl px-6 py-16 md:px-8 md:py-20">
        <div className="max-w-2xl">
          <h2 id="features-heading" className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            What you get
          </h2>
          <p className="mt-3 text-lg text-muted-foreground">
            Not a chat box you have to know what to ask. Brief reads the whole document and shows its work.
          </p>
        </div>
        <ul className="mt-10 grid gap-5 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                {feature.icon}
              </span>
              <h3 className="text-xl font-semibold tracking-tight text-balance text-foreground">{feature.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
