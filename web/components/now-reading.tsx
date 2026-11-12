"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Check } from "lucide-react";

import { useUploadNotifications } from "@/components/upload-notifications";
import { stepOf, stepProgress, stepText, STEPS, type TrackedDocument } from "@/lib/tracking";
import { cn } from "@/lib/utils";

const MOST_SHOWN = 3;

function Timeline({ entry }: { entry: TrackedDocument }) {
  const step = stepOf(entry);
  const finished = step === STEPS.length - 1;
  const progress = stepProgress(entry);
  return (
    <li className="rounded-xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium text-foreground">{entry.document.filename}</p>
        {finished ? (
          <Link
            href={`/dashboard/documents/${entry.document.id}`}
            className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95"
          >
            View document
          </Link>
        ) : (
          <p className="text-sm text-muted-foreground">{stepText(entry)}</p>
        )}
      </div>
      <ol aria-label={`Steps for ${entry.document.filename}`} className="mt-4 grid grid-cols-4">
        {STEPS.map((label, index) => {
          const done = index < step || finished;
          const current = index === step && !finished;
          // The line leading into a step fills when the step before it is done. Leading into the one being worked on it fills as far as the reading has got.
          const fill = step > index || finished ? 100 : step === index && progress !== null ? Math.round(progress * 100) : 0;
          return (
            <li key={label} aria-current={current ? "step" : undefined} className="relative flex flex-col items-center gap-2 text-center">
              {index > 0 && (
                <span aria-hidden="true" className="absolute top-3.5 right-1/2 h-0.5 w-full -translate-y-1/2 overflow-hidden rounded-full bg-border">
                  <span
                    className={cn(
                      "block h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-700 motion-safe:ease-out",
                      current && progress === null && "w-1/3 motion-safe:animate-pulse",
                    )}
                    style={current && progress === null ? undefined : { width: `${fill}%` }}
                  />
                </span>
              )}
              <span
                aria-hidden="true"
                className={cn(
                  "relative z-10 flex size-7 items-center justify-center rounded-full border-2 text-xs font-semibold",
                  done && "border-primary bg-primary text-primary-foreground",
                  current && "border-primary bg-card text-primary ring-4 ring-primary/15 motion-safe:animate-pulse",
                  !done && !current && "border-border bg-card text-muted-foreground",
                )}
              >
                {done ? <Check className="size-4 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-300" /> : index + 1}
              </span>
              <span className={cn("text-xs leading-tight", current ? "font-medium text-foreground" : done ? "text-foreground" : "text-muted-foreground")}>
                {label}
                <span className="sr-only">{done ? " (done)" : current ? " (now)" : ""}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </li>
  );
}

/**
 * On the Dashboard while documents are being read: each one with its four steps, so the person can see where it is and that
 * something is happening. When a document is ready its last step is ticked and a button to open it appears, a little before the card
 * goes. It shows nothing when nothing is being read. The steps move only for people who have not asked for less motion.
 */
export function NowReading() {
  const { tracked } = useUploadNotifications();
  const section = useRef<HTMLElement>(null);
  const wasEmpty = useRef(true);
  const count = tracked.length;

  // On a phone the card sits above the upload box, but the person is looking at the Upload button below it. When the first
  // document starts being read, bring the card into view so they can see it working without scrolling to find it.
  useEffect(() => {
    if (count > 0 && wasEmpty.current && typeof window !== "undefined" && window.matchMedia?.("(max-width: 639px)").matches) {
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      section.current?.scrollIntoView?.({ behavior: calm ? "auto" : "smooth", block: "start" });
    }
    wasEmpty.current = count === 0;
  }, [count]);

  if (count === 0) return null;
  const shown = tracked.slice(0, MOST_SHOWN);
  return (
    <section
      ref={section}
      aria-labelledby="now-reading-heading"
      className="scroll-mt-20 rounded-2xl border border-primary/25 bg-card p-5 shadow-sm max-sm:order-first motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-300"
    >
      <h2 id="now-reading-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Now reading
      </h2>
      <p className="mt-0.5 mb-4 text-sm text-muted-foreground">Short documents take seconds, long ones a minute or two. You can leave this page, and a note will tell you when it is ready.</p>
      <ul className="flex flex-col gap-3">
        {shown.map((entry) => (
          <Timeline key={entry.document.id} entry={entry} />
        ))}
      </ul>
      {tracked.length > MOST_SHOWN && <p className="mt-3 text-sm text-muted-foreground">And {tracked.length - MOST_SHOWN} more being read.</p>}
    </section>
  );
}
