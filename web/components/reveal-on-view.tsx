"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

const noopSubscribe = () => () => {};

function readLessMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function watchLessMotion(onChange: () => void): () => void {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener?.("change", onChange);
  return () => query.removeEventListener?.("change", onChange);
}

/** `idle`: nothing has been done to the content (server, no script, or less motion). `armed`: ready to appear. `shown`: it has appeared. */
export type RevealState = "idle" | "armed" | "shown";

/**
 * Lets what is inside appear, and start its movement, when it scrolls into view. It sets two things on its element for the
 * styles to use: `data-reveal` (idle, armed, shown) for the entrance, and `data-active` (true while any part is on screen)
 * so a loop can be paused when nobody can see it.
 *
 * The content is complete and visible until a script has run, so a reader without one, and a reader who prefers less motion,
 * see everything at once and nothing waits for a scroll. Only when motion is welcome is the content made ready to appear, and
 * only then does scrolling bring it in. Once shown it stays shown.
 */
export function RevealOnView({ className, children }: { className?: string; children: ReactNode }) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [seen, setSeen] = useState(false);
  const [active, setActive] = useState(false);
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const lessMotion = useSyncExternalStore(watchLessMotion, readLessMotion, () => false);
  const canWatch = mounted && typeof IntersectionObserver !== "undefined";
  // Everything shows at once for a reader who prefers less motion, and where the browser cannot watch for scrolling.
  const showAtOnce = mounted && (lessMotion || !canWatch);

  useEffect(() => {
    if (!element || showAtOnce || !canWatch) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setActive(entry.isIntersecting);
          if (entry.isIntersecting) setSeen(true);
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, showAtOnce, canWatch]);

  const state: RevealState = !mounted ? "idle" : showAtOnce || seen ? "shown" : "armed";

  return (
    <div ref={setElement} className={className} data-reveal={state} data-active={active}>
      {children}
    </div>
  );
}
