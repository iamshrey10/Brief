"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { groupByPage, type ActiveCitation, type ClauseData } from "@/lib/documents";
import { countMatches, isSearching, splitByFind, stepMatch } from "@/lib/find";
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

/** Text with each search match marked, and the one the reader is on marked more strongly. `first` is how many matches came before this text. */
function FoundText({ text, query, first, current }: { text: string; query: string; first: number; current: number }) {
  const segments = splitByFind(text, query);
  return (
    <>
      {segments.map((segment, index) => {
        if (!segment.match) return <span key={index}>{segment.text}</span>;
        const number = first + segments.slice(0, index).filter((earlier) => earlier.match).length;
        const isCurrent = number === current;
        return (
          <mark
            key={index}
            data-find-current={isCurrent ? "true" : undefined}
            className={cn(
              "rounded px-0.5 text-foreground",
              isCurrent ? "bg-amber-300 ring-2 ring-primary dark:bg-amber-400/60" : "bg-amber-200/70 dark:bg-amber-400/25",
            )}
          >
            {segment.text}
          </mark>
        );
      })}
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
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(0);
  const searching = isSearching(query);
  const pages = useMemo(() => groupByPage(clauses), [clauses]);
  // How many matches each clause holds, in the order the clauses are shown, so a match has one number in the whole document.
  const counts = useMemo(
    () => (searching ? countMatches(pages.flatMap((page) => page.clauses.map((clause) => clause.text)), query) : []),
    [pages, query, searching],
  );
  const total = counts.reduce((sum, count) => sum + count, 0);

  // Brings the match the reader is on into view whenever it changes.
  useEffect(() => {
    if (!searching || total === 0) return;
    const element = document.querySelector('[data-find-current="true"]');
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  }, [searching, total, current, query]);

  function handleFindKeys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      setCurrent((value) => stepMatch(value, total, event.shiftKey ? -1 : 1));
    } else if (event.key === "Escape") {
      setQuery("");
      setCurrent(0);
    }
  }

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
      <div role="search" className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/95 px-3 py-2 backdrop-blur lg:sticky lg:top-14 lg:z-20">
        <input
          type="search"
          aria-label="Find in this document"
          placeholder="Find in this document"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setCurrent(0);
          }}
          onKeyDown={handleFindKeys}
          className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <p role="status" className="min-w-[5.5rem] text-xs text-muted-foreground">
          {searching ? (total === 0 ? "No matches" : `${current + 1} of ${total}`) : ""}
        </p>
        <button
          type="button"
          aria-label="Previous match"
          disabled={total === 0}
          onClick={() => setCurrent((value) => stepMatch(value, total, -1))}
          className="rounded-md border border-border px-2 py-1.5 text-sm text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40"
        >
          ↑
        </button>
        <button
          type="button"
          aria-label="Next match"
          disabled={total === 0}
          onClick={() => setCurrent((value) => stepMatch(value, total, 1))}
          className="rounded-md border border-border px-2 py-1.5 text-sm text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40"
        >
          ↓
        </button>
      </div>
      {pages.map(({ pageNumber, clauses: pageClauses }, pageIndex) => (
        <div key={pageNumber} className="rounded-2xl border border-border bg-card">
          <h3 className="rounded-t-2xl border-b border-border bg-card/95 px-5 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase backdrop-blur lg:sticky lg:top-[6.75rem] lg:z-10">
            Page {pageNumber}
          </h3>
          <ol className="divide-y divide-border">
            {pageClauses.map((clause, clauseIndex) => {
              const position = pages.slice(0, pageIndex).reduce((sum, page) => sum + page.clauses.length, 0) + clauseIndex;
              const before = counts.slice(0, position).reduce((sum, count) => sum + count, 0);
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
                    {searching ? (
                      <FoundText text={clause.text} query={query} first={before} current={current} />
                    ) : isActive ? (
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
