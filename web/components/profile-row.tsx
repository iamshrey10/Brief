"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * One row of the Profile page's list: an icon, a title and a line about it, which opens in place to show the whole section.
 * A link to the section's own anchor, such as /dashboard/profile#sharing, opens its row and scrolls to it.
 */
export function ProfileRow({
  anchor,
  icon,
  title,
  description,
  href,
  children,
}: {
  /** The id of the section inside, which a link can point to. */
  anchor: string;
  icon: ReactNode;
  title: string;
  description: string;
  /** When given, the row is a link to another page instead of opening in place. */
  href?: string;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function openIfLinkedTo() {
      if (window.location.hash !== `#${anchor}` || !ref.current) return;
      ref.current.open = true;
      document.getElementById(anchor)?.scrollIntoView?.({ block: "start" });
    }
    openIfLinkedTo();
    window.addEventListener("hashchange", openIfLinkedTo);
    return () => window.removeEventListener("hashchange", openIfLinkedTo);
  }, [anchor]);

  if (href) {
    return (
      <Link href={href} className="lift flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">{title}</span>
          <span className="block text-xs text-muted-foreground">{description}</span>
        </span>
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    );
  }

  return (
    <details ref={ref} className="group lift rounded-2xl border border-border bg-card shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl p-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">{title}</span>
          <span className="block text-xs text-muted-foreground">{description}</span>
        </span>
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
      </summary>
      <div className="border-t border-border p-4 group-open:animate-in group-open:fade-in-0 group-open:slide-in-from-top-1 group-open:duration-200 motion-reduce:animate-none [&>section]:rounded-none [&>section]:border-0 [&>section]:bg-transparent [&>section]:p-0 [&>section]:shadow-none">
        {children}
      </div>
    </details>
  );
}
