"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { suggestionsFor } from "@/lib/suggested-questions";
import { Button } from "@/components/ui/button";
import { askQuestion, MAX_QUESTION_LENGTH, type AskCitation, type AskResult } from "@/lib/ask";
import { fetchUsage, questionsLeftNote } from "@/lib/usage";

type Message =
  | { id: number; kind: "question"; text: string }
  | { id: number; kind: "answer"; result: AskResult }
  | { id: number; kind: "error"; text: string; reference?: string };

function AnswerBubble({
  result,
  onCitationSelect,
}: {
  result: AskResult;
  onCitationSelect: (citation: AskCitation) => void;
}) {
  // Not finding an answer is a correct outcome, not a failure, so it's styled calmly.
  if (!result.found) {
    return (
      <div className="max-w-[90%] rounded-lg bg-secondary px-4 py-3 text-sm text-secondary-foreground">
        {result.answer}
      </div>
    );
  }

  return (
    <div className="flex max-w-[90%] flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-card-foreground">
      <p className="leading-relaxed">{result.answer}</p>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          From the document
        </p>
        {result.citations.map((citation) => (
          <button
            key={`${citation.clause_id}-${citation.quote}`}
            type="button"
            title="Show this in the document"
            onClick={() => onCitationSelect(citation)}
            className="block w-full rounded-md border-l-2 border-primary px-3 py-1.5 text-left text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="block text-xs">Page {citation.page_number}</span>
            <span className="italic">&ldquo;{citation.quote}&rdquo;</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChatPanel({
  documentId,
  docType,
  suggestions,
  onCitationSelect,
}: {
  documentId: string;
  docType?: string;
  /** The questions to offer before the first one: a list, or "loading" while they are being worked out. The general ones for the kind when left out. */
  suggestions?: string[] | "loading";
  onCitationSelect: (citation: AskCitation) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  // What to say about the daily limit of questions, or nothing while plenty are left.
  const [limitNote, setLimitNote] = useState<string | null>(null);
  const nextId = useRef(0);
  // Bumped on every fresh start, so an answer that arrives after it is dropped instead of reappearing.
  const chatRun = useRef(0);

  // Looks at where the person stands today. It is only a hint, so when the numbers cannot be had, or
  // the panel has gone by the time they arrive, nothing is shown and nothing is thrown.
  useEffect(() => {
    let current = true;
    void fetchUsage().then((outcome) => {
      if (current) setLimitNote(outcome.ok ? questionsLeftNote(outcome.usage.ask) : null);
    });
    return () => {
      current = false;
    };
  }, []);

  // The box grows with the conversation. When a question is sent it is brought to the top of the view, so the
  // answer that arrives under it is read from its first line, and nothing scrolls when the answer itself arrives.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.kind !== "question") return;
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(`ask-message-${last.id}`)?.scrollIntoView?.({ block: "start", behavior: calm ? "auto" : "smooth" });
  }, [messages]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void send(draft.trim());
  }

  async function send(question: string) {
    if (!question || pending) return;

    const questionMessage: Message = { id: nextId.current++, kind: "question", text: question };
    setMessages((previous) => [...previous, questionMessage]);
    setDraft("");
    setPending(true);

    const run = chatRun.current;
    const outcome = await askQuestion(documentId, question);
    if (run !== chatRun.current) return;
    const reply: Message = outcome.ok
      ? { id: nextId.current++, kind: "answer", result: outcome.result }
      : { id: nextId.current++, kind: "error", text: outcome.message, reference: outcome.reference };
    setMessages((previous) => [...previous, reply]);
    setPending(false);

    // Whether the question was answered or refused, the count has moved, so look again.
    const usage = await fetchUsage();
    if (usage.ok) setLimitNote(questionsLeftNote(usage.usage.ask));
  }

  function startOver() {
    chatRun.current += 1;
    setMessages([]);
    setDraft("");
    setPending(false);
  }

  return (
    <section
      aria-label="Ask about this document"
      className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-background"
    >
      {(messages.length > 0 || pending) && (
        <div className="flex justify-end border-b border-border px-3 py-2">
          <Button type="button" variant="ghost" size="sm" onClick={startOver}>
            <RotateCcw aria-hidden="true" className="size-3.5" />
            New chat
          </Button>
        </div>
      )}
      <div
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="flex flex-1 flex-col gap-3 p-4 max-sm:flex-none max-sm:p-3 max-sm:*:shrink-0 lg:min-h-0 lg:overflow-y-auto"
      >
        {messages.length === 0 && !pending && (
          <div className="my-auto px-2 text-center">
            <p className="font-heading text-lg font-semibold text-foreground max-sm:text-base">
              Ask about this document
            </p>
            <p className="mt-2 text-sm text-muted-foreground max-sm:hidden">
              Every answer points to the exact clause it came from. If the document doesn&apos;t
              cover something, Brief will say so instead of guessing.
            </p>
            <div className="mt-5 flex flex-col items-center gap-2 max-sm:mt-2 max-sm:items-stretch">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase max-sm:text-left">Try asking</p>
              {suggestions === "loading" ? (
                <p role="status" className="text-xs text-muted-foreground">
                  Finding good questions for this document...
                </p>
              ) : (
                <ul aria-label="Suggested questions" className="flex flex-wrap justify-center gap-2 max-sm:-mx-3 max-sm:flex-nowrap max-sm:justify-start max-sm:overflow-x-auto max-sm:px-3 max-sm:pb-1 max-sm:[mask-image:linear-gradient(to_right,black_calc(100%-0.75rem),transparent)]">
                  {(suggestions ?? suggestionsFor(docType)).map((question) => (
                    <li key={question} className="max-sm:shrink-0">
                      <button
                        type="button"
                        onClick={() => void send(question)}
                        className="rounded-full border border-border bg-card px-3 py-1.5 text-left text-xs max-sm:min-h-11 max-sm:px-4 max-sm:whitespace-nowrap text-foreground transition-colors outline-none hover:border-primary/50 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {question}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {messages.map((message) => {
          if (message.kind === "question") {
            return (
              <div
                key={message.id}
                id={`ask-message-${message.id}`}
                className="max-w-[90%] scroll-mt-20 self-end rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
              >
                {message.text}
              </div>
            );
          }
          if (message.kind === "answer") {
            return (
              <AnswerBubble
                key={message.id}
                result={message.result}
                onCitationSelect={onCitationSelect}
              />
            );
          }
          return (
            <div
              key={message.id}
              className="max-w-[90%] rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              <p>{message.text}</p>
              {message.reference && <p className="mt-1 text-xs">Reference: {message.reference}</p>}
            </div>
          );
        })}

        {pending && <p className="text-sm text-muted-foreground">Reading the document...</p>}
      </div>

      <form onSubmit={handleSubmit} className="sticky bottom-0 max-sm:bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 flex shrink-0 flex-col gap-2 rounded-b-lg border-t border-border bg-background p-3 max-sm:grid max-sm:grid-cols-[1fr_auto] max-sm:gap-x-2 max-sm:gap-y-1 max-sm:p-2.5">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          maxLength={MAX_QUESTION_LENGTH}
          rows={2}
          placeholder='Ask about this document, for example "Can I pay this off early?"'
          aria-label="Your question"
          className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground max-sm:h-11 max-sm:py-2.5 max-sm:placeholder:truncate focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {/* On a phone the question box and Ask share one row, and the note sits under them. */}
        <div className="flex items-center justify-between gap-3 max-sm:contents">
          <div className="flex flex-col max-sm:col-span-2 max-sm:row-start-2">
            <p className="text-xs text-muted-foreground">
              Explains what the document says. Not legal advice.
            </p>
            {limitNote && <p className="text-xs font-medium text-foreground">{limitNote}</p>}
          </div>
          <Button type="submit" disabled={!draft.trim() || pending} className="max-sm:col-start-2 max-sm:row-start-1 max-sm:h-11">
            {pending ? "Asking..." : "Ask"}
          </Button>
        </div>
      </form>
    </section>
  );
}
