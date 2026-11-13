import type { CSSProperties } from "react";

import { HOW_WORDS, LandingBackdrop } from "@/components/landing-backdrop";
import { RevealOnView } from "@/components/reveal-on-view";
import { StepArt } from "@/components/landing-step-art";

/** The path from a file to a checked answer, in the order a person meets it. Each step is something the app does today. */
export const STEPS = [
  {
    title: "Add your document",
    body: "Drop in a PDF, or a photo of the pages. A blurry photo is flagged instead of quietly accepted.",
  },
  {
    title: "Brief reads every clause",
    body: "It splits the document into its real numbered clauses, then finds the key terms and answers the questions people usually skip.",
  },
  {
    title: "Ask, then check",
    body: "Ask in plain words. Each answer shows its quote, and a click jumps to that clause with the exact words highlighted.",
  },
];

/** How it works, as three numbered steps. The section's id is what the top bar's link jumps to. */
export function LandingSteps() {
  return (
    <section id="how" aria-labelledby="how-heading" className="relative isolate flex min-h-[calc(100svh-4.0625rem)] scroll-mt-16 items-center overflow-hidden border-t border-border/70">
      <LandingBackdrop words={HOW_WORDS} />
      <div className="mx-auto w-[min(100%-3rem,1400px)] py-12 md:py-14">
        <div className="max-w-2xl">
          <h2 id="how-heading" className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl md:text-5xl">
            How it works
          </h2>
          <p className="mt-3 text-base text-muted-foreground sm:mt-4 sm:text-xl">From a file to an answer you can check, in three steps.</p>
        </div>
        <RevealOnView className="mt-12">
          <ol className="grid gap-10 md:grid-cols-3 md:gap-8">
            {STEPS.map((step, index) => (
              <li key={step.title} style={{ "--i": index } as CSSProperties} className="hiw-card flex flex-col gap-3">
                <span aria-hidden="true" className="hiw-rule block h-0.5 w-full origin-left rounded-full bg-primary/35" />
                <span className="hiw-number inline-block origin-left font-heading text-base font-semibold tracking-wide text-primary">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <StepArt index={index} />
                <h3 className="text-xl font-semibold tracking-tight text-balance text-foreground sm:text-2xl">{step.title}</h3>
                <p className="text-base leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </RevealOnView>
      </div>
    </section>
  );
}
