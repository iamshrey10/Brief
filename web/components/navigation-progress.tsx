"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** If a page never arrives, the bar is taken away after this long rather than left running. */
const GIVE_UP_AFTER_MS = 15_000;

/** The link a click landed on, when pressing it goes to another page of this site in this tab. */
function internalTarget(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return null;
  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  // Only the page address counts: a link to a part of the same page goes nowhere.
  return url.pathname + url.search === window.location.pathname + window.location.search ? null : url.pathname + url.search;
}

/**
 * A thin bar across the top that starts the moment a link to another page is pressed and stays until that page arrives. The
 * signed in pages are built on the server, so a press can take a moment, and this tells the person at once that it was heard.
 * It draws nothing for a link that leaves the site, opens a new tab, or only moves within the page.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const here = search ? `${pathname}?${search}` : pathname;
  // The page the person was on when they pressed a link. The bar runs for as long as they are still on it.
  const [leaving, setLeaving] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (internalTarget(event) === null) return;
      setLeaving(window.location.pathname + window.location.search);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setLeaving(null), GIVE_UP_AFTER_MS);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (leaving === null || leaving !== here) return null;
  return (
    <div aria-hidden="true" data-nav-progress="" className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-[3px] print:hidden">
      <div className="nav-progress-bar h-full w-full origin-left bg-primary shadow-[0_0_8px_var(--primary)]" />
    </div>
  );
}
