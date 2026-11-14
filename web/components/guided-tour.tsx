"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { clearTourStep, readTourStep, subscribeToTour, writeTourStep } from "@/lib/tour-state";
import { TOUR_STEPS } from "@/lib/tour-steps";

type Box = { top: number; left: number; width: number; height: number };

/** The room left around a highlighted part, so its edges are not cut tight. */
const PAD = 8;
/** Where a highlighted part is brought to, measured from the top of the screen, so it sits clear of the top bar and the card. */
const SCROLL_TO_PHONE = 72;
const SCROLL_TO_LAPTOP = 96;

function subscribeToQuery(query: string, onChange: () => void) {
  const list = window.matchMedia(query);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => subscribeToQuery(query, onChange),
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * Follows the part of the page a step points at: waits for it to appear, brings it smoothly into view once, then reports where
 * it is for as long as the step lasts, so the highlight stays on it through scrolling, resizing and the page settling. Returns
 * null until it has been found, and for a step that points at nothing.
 */
function useTargetBox(step: number, target: string | undefined, enabled: boolean, phone: boolean, reduceMotion: boolean): Box | null {
  const [found, setFound] = useState<{ step: number; box: Box } | null>(null);

  useEffect(() => {
    if (!enabled || !target) return;
    let frame = 0;
    let scrolled = false;
    let last = "";
    const look = () => {
      const element = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
      if (element) {
        const rect = element.getBoundingClientRect();
        if (!scrolled) {
          scrolled = true;
          const wanted = phone ? SCROLL_TO_PHONE : SCROLL_TO_LAPTOP;
          if (Math.abs(rect.top - wanted) > 24) {
            window.scrollTo({ top: window.scrollY + rect.top - wanted, behavior: reduceMotion ? "auto" : "smooth" });
          }
        }
        const key = `${Math.round(rect.top)},${Math.round(rect.left)},${Math.round(rect.width)},${Math.round(rect.height)}`;
        if (key !== last) {
          last = key;
          setFound({ step, box: { top: rect.top, left: rect.left, width: rect.width, height: rect.height } });
        }
      }
      frame = requestAnimationFrame(look);
    };
    frame = requestAnimationFrame(look);
    return () => cancelAnimationFrame(frame);
  }, [step, target, enabled, phone, reduceMotion]);

  // A box measured for an earlier step is kept until the new one is found, so the highlight glides from one part to the next.
  return enabled && target ? (found?.box ?? null) : null;
}

/**
 * A guided tour that stays open while the person moves around. It points at the real part of the page each step is about,
 * scrolls it into view smoothly, and takes them to the next page when they press Next. It is kept in the layout of the signed in
 * pages, so opening another page never closes it, and the step is remembered for the tab so a refresh does not either.
 * It closes only when the person closes it: Skip tour, Done or the Escape key. The page stays usable underneath, so they can
 * still press the sections at the top or the bottom while it is open.
 */
export function GuidedTour() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The step lives in the tab's storage, so it survives a refresh and a move to another page.
  const step = useSyncExternalStore(
    subscribeToTour,
    () => readTourStep(TOUR_STEPS.length),
    () => null,
  );
  const heading = useRef<HTMLHeadingElement>(null);
  const phone = useMedia("(max-width: 639px)");
  const reduceMotion = useMedia("(prefers-reduced-motion: reduce)");

  // The address ?tour=1 starts it from the first step, from the welcome page or from Profile, and is then tidied away.
  const asked = searchParams.get("tour") === "1";
  useEffect(() => {
    if (!asked) return;
    writeTourStep(0);
    window.history.replaceState(window.history.state, "", pathname);
  }, [asked, pathname]);

  const current = step === null ? null : TOUR_STEPS[step];
  const onItsPage = current !== null && (!current.path || pathname === current.path);
  const box = useTargetBox(step ?? 0, current?.target, onItsPage, phone, reduceMotion);

  useEffect(() => {
    if (step !== null) heading.current?.focus({ preventScroll: true });
  }, [step]);

  function close() {
    clearTourStep();
  }

  useEffect(() => {
    if (step === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step]);

  function goTo(next: number) {
    writeTourStep(next);
    const path = TOUR_STEPS[next].path;
    if (path && path !== pathname) router.push(path);
  }

  if (step === null || current === null) return null;
  const last = step === TOUR_STEPS.length - 1;
  const transition = reduceMotion ? "none" : "top 400ms cubic-bezier(0.22,1,0.36,1), left 400ms cubic-bezier(0.22,1,0.36,1), width 400ms cubic-bezier(0.22,1,0.36,1), height 400ms cubic-bezier(0.22,1,0.36,1), opacity 300ms ease";

  return (
    <>
      {/* The dimming and the highlight. Neither takes clicks, so the page stays usable underneath. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[45] print:hidden">
        {box ? (
          <div
            data-tour-spotlight=""
            className="absolute rounded-2xl ring-2 ring-primary/80"
            style={{
              top: box.top - PAD,
              left: box.left - PAD,
              width: box.width + PAD * 2,
              height: box.height + PAD * 2,
              boxShadow: "0 0 0 100vmax rgb(0 0 0 / 0.5)",
              transition,
            }}
          />
        ) : (
          <div data-tour-dim="" className="absolute inset-0 bg-black/45" style={{ transition: reduceMotion ? "none" : "opacity 300ms ease" }} />
        )}
      </div>

      <div
        role="dialog"
        aria-labelledby="tour-title"
        className="fixed inset-x-3 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] z-50 mx-auto max-w-md sm:inset-x-auto sm:right-6 sm:bottom-6 sm:mx-0 sm:w-[24rem] print:hidden"
      >
        <div
          key={current.id}
          className="flex max-h-[60dvh] flex-col gap-3 overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-300 sm:p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Step {step + 1} of {TOUR_STEPS.length}
            </p>
            <div aria-hidden="true" className="flex gap-1.5">
              {TOUR_STEPS.map((s, i) => (
                <span
                  key={s.id}
                  className={`h-1.5 rounded-full transition-all duration-300 motion-reduce:transition-none ${i === step ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30"}`}
                />
              ))}
            </div>
          </div>

          <div>
            <h2 id="tour-title" ref={heading} tabIndex={-1} className="font-heading text-lg font-semibold tracking-tight text-foreground outline-none">
              {current.title}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{current.body}</p>
            {current.points && (
              <ul className="mt-2.5 flex flex-col gap-1.5 text-sm text-foreground">
                {current.points.map((point) => (
                  <li key={point} className="flex gap-2">
                    <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                    {point}
                  </li>
                ))}
              </ul>
            )}
            {!onItsPage && current.path && (
              <Button type="button" variant="outline" size="lg" className="mt-3" onClick={() => router.push(current.path!)}>
                Show me
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
            <Button type="button" variant="ghost" size="lg" onClick={close}>
              {last ? "Close" : "Skip tour"}
            </Button>
            <div className="flex gap-2">
              {step > 0 && (
                <Button type="button" variant="outline" size="lg" onClick={() => goTo(step - 1)}>
                  Back
                </Button>
              )}
              <Button type="button" size="lg" onClick={() => (last ? close() : goTo(step + 1))}>
                {last ? "Done" : "Next"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
