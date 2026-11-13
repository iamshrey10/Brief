"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { TOUR_STEPS } from "@/lib/tour-steps";

/**
 * A short card by card walkthrough, shown on the Dashboard when the address asks for it. It is a plain dialog: a bottom sheet on a
 * phone, a centred card on a laptop. Skip, the Escape key, or finishing closes it, and the address is cleaned so a refresh does not
 * bring it back. A button on a card closes it and goes to the place it describes.
 */
export function FirstTimeTour({ start }: { start: boolean }) {
  const [open, setOpen] = useState(start);
  const [index, setIndex] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const step = TOUR_STEPS[index];
  const last = index === TOUR_STEPS.length - 1;

  function close() {
    setOpen(false);
    // Drop ?tour=1 from the address without leaving the page.
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }

  useEffect(() => {
    if (open) heading.current?.focus();
  }, [open, index]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (event.key !== "Tab" || !card.current) return;
      // Keep the Tab key inside the card while it is open.
      const focusable = card.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
      if (focusable.length === 0) return;
      const first = focusable[0];
      const lastOne = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) {
        event.preventDefault();
        lastOne.focus();
      } else if (!event.shiftKey && document.activeElement === lastOne) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6">
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className="flex max-h-[85dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-3xl border border-border bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Step {index + 1} of {TOUR_STEPS.length}
          </p>
          <div aria-hidden="true" className="flex gap-1.5">
            {TOUR_STEPS.map((s, i) => (
              <span key={s.id} className={i === index ? "h-1.5 w-5 rounded-full bg-primary" : "h-1.5 w-1.5 rounded-full bg-muted-foreground/30"} />
            ))}
          </div>
        </div>

        <div>
          <h2 id="tour-title" ref={heading} tabIndex={-1} className="font-heading text-xl font-semibold tracking-tight text-foreground outline-none">
            {step.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          {step.points && (
            <ul className="mt-3 flex flex-col gap-1.5 text-sm text-foreground">
              {step.points.map((point) => (
                <li key={point} className="flex gap-2">
                  <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                  {point}
                </li>
              ))}
            </ul>
          )}
          {step.action && (
            <Link
              href={step.action.href}
              onClick={close}
              className="mt-4 inline-flex h-10 items-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted max-sm:h-11"
            >
              {step.action.label}
            </Link>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <Button type="button" variant="ghost" size="lg" onClick={close}>
            {last ? "Close" : "Skip tour"}
          </Button>
          <div className="flex gap-2">
            {index > 0 && (
              <Button type="button" variant="outline" size="lg" onClick={() => setIndex(index - 1)}>
                Back
              </Button>
            )}
            <Button type="button" size="lg" onClick={() => (last ? close() : setIndex(index + 1))}>
              {last ? "Done" : "Next"}
            </Button>
          </div>
        </div>
        {last && <p className="text-xs text-muted-foreground">You can take this tour again any time from Profile.</p>}
      </div>
    </div>
  );
}
