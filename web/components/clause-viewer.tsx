"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { groupByPage, type ActiveCitation, type ClauseData } from "@/lib/documents";
import { splitByQuote } from "@/lib/highlight";

function HighlightedText({ text, quote }: { text: string; quote: string }) {
  return (
    <>
      {splitByQuote(text, quote).map((segment, index) =>
        segment.highlighted ? (
          <mark key={index} className="rounded bg-primary/25 px-0.5 text-foreground">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

export function ClauseViewer({
  clauses,
  activeCitation = null,
}: {
  clauses: ClauseData[];
  activeCitation?: ActiveCitation | null;
}) {
  // Runs for every pick, including the same citation twice, because each click hands over
  // a fresh object. Moves keyboard focus too, so a screen reader lands on the clause.
  useEffect(() => {
    if (!activeCitation) return;
    const element = document.getElementById(`clause-${activeCitation.clauseId}`);
    if (!element) return;

    // Clauses can be taller than the screen, so centre the highlighted words when there are
    // some. Centring the whole clause could leave the quote off screen.
    const target = element.querySelector("mark") ?? element;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    element.focus({ preventScroll: true });
  }, [activeCitation]);

  return (
    <section aria-label="Document text" className="flex flex-col gap-4">
      <h2 className="sr-only">Document text</h2>
      {groupByPage(clauses).map(({ pageNumber, clauses: pageClauses }) => (
        <div key={pageNumber} className="rounded-2xl border border-border bg-card">
          <h3 className="rounded-t-2xl border-b border-border bg-card/95 px-5 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase backdrop-blur lg:sticky lg:top-14 lg:z-10">
            Page {pageNumber}
          </h3>
          <ol className="divide-y divide-border">
            {pageClauses.map((clause) => {
              const isActive = activeCitation?.clauseId === clause.id;
              return (
                <li key={clause.id} className="last:rounded-b-2xl">
                  <p
                    id={`clause-${clause.id}`}
                    tabIndex={-1}
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "border-l-2 px-5 py-3.5 text-sm leading-relaxed whitespace-pre-line text-card-foreground transition-colors outline-none",
                      isActive ? "border-l-primary bg-accent" : "border-l-transparent hover:bg-muted/50",
                    )}
                  >
                    {isActive ? (
                      <HighlightedText text={clause.text} quote={activeCitation.quote} />
                    ) : (
                      clause.text
                    )}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </section>
  );
}
