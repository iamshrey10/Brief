import type { ReactNode } from "react";

import type { CSSProperties } from "react";

import { FEATURES_WORDS, LandingBackdrop } from "@/components/landing-backdrop";
import { RevealOnView } from "@/components/reveal-on-view";

type Feature = { title: string; body: string; icon: ReactNode };

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="h-6 w-6"
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
    <section id="features" aria-labelledby="features-heading" className="relative isolate flex min-h-[calc(100svh-4.0625rem)] scroll-mt-16 items-center overflow-hidden border-t border-border/70 bg-secondary/40">
      <LandingBackdrop words={FEATURES_WORDS} />
      <RevealOnView className="mx-auto w-[min(100%-3rem,1400px)] py-12 md:py-14">
        <div className="hiw-card max-w-2xl" style={{ "--i": 0 } as CSSProperties}>
          <h2 id="features-heading" className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
            What you get
          </h2>
          <p className="mt-4 text-xl text-muted-foreground">
            Not a chat box you have to know what to ask. Brief reads the whole document and shows its work.
          </p>
        </div>
        <ul className="mt-12 grid gap-6 md:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <li key={feature.title} style={{ "--i": index + 1 } as CSSProperties} className="hiw-card flex">
              <div className="lift flex w-full flex-col gap-4 rounded-2xl border border-border bg-card p-8">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  {feature.icon}
                </span>
                <h3 className="text-2xl font-semibold tracking-tight text-balance text-foreground">{feature.title}</h3>
                <p className="text-base leading-relaxed text-muted-foreground">{feature.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </RevealOnView>
    </section>
  );
}
