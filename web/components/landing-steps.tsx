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
    <section id="how" aria-labelledby="how-heading" className="border-t border-border/70">
      <div className="mx-auto w-full max-w-6xl px-6 py-16 md:px-8 md:py-20">
        <div className="max-w-2xl">
          <h2 id="how-heading" className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            How it works
          </h2>
          <p className="mt-3 text-lg text-muted-foreground">From a file to an answer you can check, in three steps.</p>
        </div>
        <ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-3 border-t-2 border-primary/30 pt-5">
              <span className="font-heading text-sm font-semibold tracking-wide text-primary">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="text-xl font-semibold tracking-tight text-balance text-foreground">{step.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
