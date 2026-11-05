import type { ReactNode } from "react";

/**
 * Wraps every page, and is made again on each navigation, so each page comes in with a short fade instead of snapping into place.
 * Only the opacity changes, nothing moves, and a reader who prefers less motion gets no fade.
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">{children}</div>;
}
