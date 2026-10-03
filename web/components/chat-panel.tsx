"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { askQuestion, MAX_QUESTION_LENGTH, type AskResult } from "@/lib/ask";

type Message =
  | { id: number; kind: "question"; text: string }
  | { id: number; kind: "answer"; result: AskResult }
  | { id: number; kind: "error"; text: string };

function AnswerBubble({ result }: { result: AskResult }) {
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
          <blockquote
            key={`${citation.clause_id}-${citation.quote}`}
            className="border-l-2 border-primary pl-3 text-muted-foreground"
          >
            <span className="block text-xs">Page {citation.page_number}</span>
            <span className="italic">&ldquo;{citation.quote}&rdquo;</span>
          </blockquote>
        ))}
      </div>
    </div>
  );
}

export function ChatPanel({ documentId }: { documentId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const nextId = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Scrolls only the conversation, not the whole page, so a new answer never yanks the
  // reader away from the document they are comparing it against.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const question = draft.trim();
    if (!question || pending) return;

    const questionMessage: Message = { id: nextId.current++, kind: "question", text: question };
    setMessages((previous) => [...previous, questionMessage]);
    setDraft("");
    setPending(true);

    const outcome = await askQuestion(documentId, question);
    const reply: Message = outcome.ok
      ? { id: nextId.current++, kind: "answer", result: outcome.result }
      : { id: nextId.current++, kind: "error", text: outcome.message };
    setMessages((previous) => [...previous, reply]);
    setPending(false);
  }

  return (
    <section
      aria-label="Ask about this document"
      className="flex max-h-[75vh] min-h-[28rem] flex-col rounded-lg border border-border bg-background lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:max-h-none"
    >
      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
      >
        {messages.length === 0 && !pending && (
          <div className="my-auto px-2 text-center">
            <p className="font-heading text-lg font-semibold text-foreground">
              Ask about this document
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Every answer points to the exact clause it came from. If the document doesn&apos;t
              cover something, Brief will say so instead of guessing.
            </p>
          </div>
        )}

        {messages.map((message) => {
          if (message.kind === "question") {
            return (
              <div
                key={message.id}
                className="max-w-[90%] self-end rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
              >
                {message.text}
              </div>
            );
          }
          if (message.kind === "answer") {
            return <AnswerBubble key={message.id} result={message.result} />;
          }
          return (
            <div
              key={message.id}
              className="max-w-[90%] rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {message.text}
            </div>
          );
        })}

        {pending && <p className="text-sm text-muted-foreground">Reading the document...</p>}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 border-t border-border p-3">
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
          className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Explains what the document says. Not legal advice.
          </p>
          <Button type="submit" disabled={!draft.trim() || pending}>
            {pending ? "Asking..." : "Ask"}
          </Button>
        </div>
      </form>
    </section>
  );
}
