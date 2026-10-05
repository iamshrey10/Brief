"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActiveCitation } from "@/lib/documents";
import {
  fetchChecklist,
  fetchKeyTerms,
  groupChecklist,
  splitKeyTerms,
  type ChecklistAnswer,
  type ChecklistResult,
  type KeyTerm,
  type KeyTermsResult,
  type LoadOutcome,
} from "@/lib/overview";

type LoadState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; result: T };

/**
 * Loads one thing for a document and exposes a retry. Loading is derived from what has been
 * stored, not set at the start of the effect, so there is no state change inside the effect
 * body and a retry or a different document simply shows loading until its result arrives.
 */
function useLoad<T>(documentId: string, fetcher: (id: string) => Promise<LoadOutcome<T>>) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; outcome: LoadOutcome<T> } | null>(null);
  const key = `${documentId}:${attempt}`;

  useEffect(() => {
    let cancelled = false;
    fetcher(documentId).then((outcome) => {
      if (!cancelled) setLoaded({ key, outcome });
    });
    return () => {
      cancelled = true;
    };
  }, [documentId, fetcher, key]);

  const state: LoadState<T> =
    loaded === null || loaded.key !== key
      ? { status: "loading" }
      : loaded.outcome.ok
        ? { status: "ready", result: loaded.outcome.result }
        : { status: "error", message: loaded.outcome.message };

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 className="font-heading text-lg font-semibold text-foreground">{title}</h2>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div role="status" className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div aria-hidden className="flex flex-col gap-2">
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-14 rounded-lg bg-muted motion-safe:animate-pulse" />
        ))}
      </div>
    </div>
  );
}

function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      <p>{message}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function TruncatedNotice() {
  return (
    <p className="rounded-lg bg-secondary px-3 py-2 text-xs text-secondary-foreground">
      This document was too long to read in full, so some answers below may be missing.
    </p>
  );
}

/** A button that jumps to the clause the evidence came from and highlights the quoted words. */
function EvidenceButton({
  label,
  page,
  quote,
  clauseId,
  showQuote,
  onSelect,
}: {
  label: string;
  page: number | null;
  quote: string;
  clauseId: string;
  showQuote: boolean;
  onSelect: (citation: ActiveCitation) => void;
}) {
  const pageText = page === null ? "Page" : `Page ${page}`;
  return (
    <button
      type="button"
      title="Show this in the document"
      aria-label={`Show "${label}" in the document, ${pageText.toLowerCase()}`}
      onClick={() => onSelect({ clauseId, quote })}
      className="block w-full rounded-md border-l-2 border-primary px-3 py-1.5 text-left text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="block text-xs">{pageText}</span>
      {showQuote && <span className="text-sm italic">&ldquo;{quote}&rdquo;</span>}
    </button>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      // Clipboard access can be blocked, so say so instead of looking like nothing happened.
      setStatus("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={copy}
      aria-label={`Copy the wording for: ${label}`}
    >
      {status === "copied" ? <Check aria-hidden /> : <Copy aria-hidden />}
      {status === "copied" ? "Copied" : status === "failed" ? "Couldn't copy" : "Copy"}
    </Button>
  );
}

// ---------------------------------------------------------------------------------------
// Key terms

function KeyTermCard({
  term,
  onSelect,
}: {
  term: KeyTerm;
  onSelect: (citation: ActiveCitation) => void;
}) {
  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {term.label}
      </p>
      <p className="text-sm font-medium text-card-foreground">{term.value}</p>
      {term.clause_id && term.quote && (
        <EvidenceButton
          label={term.label}
          page={term.page_number}
          quote={term.quote}
          clauseId={term.clause_id}
          showQuote={false}
          onSelect={onSelect}
        />
      )}
    </li>
  );
}

function KeyTermsSection({
  documentId,
  onSelect,
}: {
  documentId: string;
  onSelect: (citation: ActiveCitation) => void;
}) {
  const { state, retry } = useLoad<KeyTermsResult>(documentId, fetchKeyTerms);

  return (
    <section aria-label="Key terms" className="flex flex-col gap-3">
      {state.status === "ready" ? (
        <SectionHeader
          title="Key terms"
          subtitle={`${state.result.terms.filter((t) => t.found).length} of ${state.result.terms.length} found`}
        />
      ) : (
        <SectionHeader title="Key terms" />
      )}

      {state.status === "loading" && (
        <LoadingBlock label="Reading your document. The first time takes a few seconds." />
      )}
      {state.status === "error" && <ErrorBlock message={state.message} onRetry={retry} />}
      {state.status === "ready" && <KeyTermsBody result={state.result} onSelect={onSelect} />}
    </section>
  );
}

function KeyTermsBody({
  result,
  onSelect,
}: {
  result: KeyTermsResult;
  onSelect: (citation: ActiveCitation) => void;
}) {
  const { found, notMentioned } = splitKeyTerms(result.terms);

  return (
    <>
      {result.truncated && <TruncatedNotice />}
      {found.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          None of the usual key terms are stated in this document.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {found.map((term) => (
            <KeyTermCard key={term.name} term={term} onSelect={onSelect} />
          ))}
        </ul>
      )}
      {notMentioned.length > 0 && (
        <details className="rounded-lg border border-border px-3 py-2 text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            Not mentioned in this document ({notMentioned.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-1 text-muted-foreground">
            {notMentioned.map((term) => (
              <li key={term.name}>{term.label}</li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Before you sign

function GapCard({ answer }: { answer: ChecklistAnswer }) {
  return (
    <li className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
      <div className="flex items-start gap-2">
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="text-sm font-medium">{answer.question}</p>
          <p className="text-sm">The document doesn&apos;t say.</p>
          <p className="text-xs opacity-80">{answer.why_it_matters}</p>
          {answer.ask_them && (
            <div className="mt-1 flex flex-col gap-2 rounded-md bg-background/60 p-2 dark:bg-background/30">
              <p className="text-xs font-medium tracking-wide uppercase">Ask them</p>
              <p className="text-sm">&ldquo;{answer.ask_them}&rdquo;</p>
              <div>
                <CopyButton text={answer.ask_them} label={answer.question} />
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function AnsweredCard({
  answer,
  onSelect,
}: {
  answer: ChecklistAnswer;
  onSelect: (citation: ActiveCitation) => void;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <p className="text-sm font-medium text-card-foreground">{answer.question}</p>
      <p className="text-sm text-card-foreground">{answer.answer}</p>
      <div className="flex flex-col gap-1">
        {answer.evidence.map((item) => (
          <EvidenceButton
            key={`${item.clause_id}-${item.quote}`}
            label={answer.question}
            page={item.page_number}
            quote={item.quote}
            clauseId={item.clause_id}
            showQuote
            onSelect={onSelect}
          />
        ))}
      </div>
    </li>
  );
}

function ChecklistSection({
  documentId,
  onSelect,
}: {
  documentId: string;
  onSelect: (citation: ActiveCitation) => void;
}) {
  const { state, retry } = useLoad<ChecklistResult>(documentId, fetchChecklist);

  let subtitle: string | undefined;
  if (state.status === "ready") {
    const { gaps, answered } = groupChecklist(state.result.answers);
    subtitle =
      gaps.length > 0
        ? `${answered.length} answered, ${gaps.length} the document doesn't say`
        : `${answered.length} answered`;
  }

  return (
    <section aria-label="Before you sign" className="flex flex-col gap-3">
      <SectionHeader title="Before you sign" subtitle={subtitle} />
      {state.status === "loading" && (
        <LoadingBlock label="Checking the questions people most often miss." />
      )}
      {state.status === "error" && <ErrorBlock message={state.message} onRetry={retry} />}
      {state.status === "ready" && <ChecklistBody result={state.result} onSelect={onSelect} />}
    </section>
  );
}

function ChecklistBody({
  result,
  onSelect,
}: {
  result: ChecklistResult;
  onSelect: (citation: ActiveCitation) => void;
}) {
  const { gaps, answered, otherNotMentioned } = groupChecklist(result.answers);

  return (
    <>
      {result.truncated && <TruncatedNotice />}

      {gaps.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Worth asking about
          </h3>
          <ul className="flex flex-col gap-2">
            {gaps.map((answer) => (
              <GapCard key={answer.id} answer={answer} />
            ))}
          </ul>
        </div>
      )}

      {answered.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            What the document says
          </h3>
          <ul className="flex flex-col gap-2">
            {answered.map((answer) => (
              <AnsweredCard key={answer.id} answer={answer} onSelect={onSelect} />
            ))}
          </ul>
        </div>
      )}

      {otherNotMentioned.length > 0 && (
        <details className="rounded-lg border border-border px-3 py-2 text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            Also not mentioned ({otherNotMentioned.length})
          </summary>
          <ul className="mt-3 flex flex-col gap-3">
            {otherNotMentioned.map((answer) => (
              <li key={answer.id} className="flex flex-col gap-1.5">
                <p className="text-card-foreground">{answer.question}</p>
                {answer.ask_them && (
                  <div className="flex flex-col items-start gap-2">
                    <p className="text-muted-foreground">Ask them: &ldquo;{answer.ask_them}&rdquo;</p>
                    <CopyButton text={answer.ask_them} label={answer.question} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------

export function OverviewPanel({
  documentId,
  onCitationSelect,
}: {
  documentId: string;
  onCitationSelect: (citation: ActiveCitation) => void;
}): ReactNode {
  return (
    <section
      aria-label="Overview"
      className="h-full overflow-y-auto rounded-lg border border-border bg-background p-4"
    >
      <div className="flex flex-col gap-8">
        <KeyTermsSection documentId={documentId} onSelect={onCitationSelect} />
        <ChecklistSection documentId={documentId} onSelect={onCitationSelect} />
      </div>
      <p className="mt-8 text-xs text-muted-foreground">
        Explains what the document says. Not legal advice.
      </p>
    </section>
  );
}
