import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** The longest the entrance is held back, so a long page does not make the last part wait. */
const MAX_STEPS = 8;
const STEP_MS = 70;

/**
 * Lets a part of a page rise into place when the page appears, one part after another by `order`. A part with nothing to
 * wait for starts straight away. Nothing moves for a reader who prefers less motion, and the part is never hidden: the delay
 * only holds back the start of the movement, and the part is already where it belongs.
 */
export function Rise({ order = 0, className, children }: { order?: number; className?: string; children: ReactNode }) {
  const delay = Math.min(Math.max(order, 0), MAX_STEPS) * STEP_MS;
  return (
    <div
      className={cn("motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:fill-mode-backwards motion-safe:duration-500", className)}
      style={delay > 0 ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
