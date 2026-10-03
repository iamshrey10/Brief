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

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    element.focus({ preventScroll: true });
  }, [activeCitation]);

  return (
    <section aria-label="Document text" className="flex flex-col gap-6">
      {groupByPage(clauses).map(({ pageNumber, clauses: pageClauses }) => (
        <div key={pageNumber} className="flex flex-col gap-2">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Page {pageNumber}
          </h3>
          {pageClauses.map((clause) => {
            const isActive = activeCitation?.clauseId === clause.id;
            return (
              <p
                key={clause.id}
                id={`clause-${clause.id}`}
                tabIndex={-1}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "rounded-lg border bg-card px-4 py-3 text-sm leading-relaxed whitespace-pre-line text-card-foreground transition-colors outline-none",
                  isActive ? "border-primary bg-accent" : "border-border",
                )}
              >
                {isActive ? (
                  <HighlightedText text={clause.text} quote={activeCitation.quote} />
                ) : (
                  clause.text
                )}
              </p>
            );
          })}
        </div>
      ))}
    </section>
  );
}
