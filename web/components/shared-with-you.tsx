import Link from "next/link";

import { JoinByLink } from "@/components/join-by-link";
import { personLabel } from "@/lib/profile";
import type { SharedWithMe } from "@/lib/sharing";

/**
 * The dashboards other people let this person look at, and a way to add one: paste the link and the code they sent.
 * It is on the Dashboard and on the Shared page, so nobody has to hunt for something that was shared with them.
 */
export function SharedWithYou({ items, headingLevel = 2 }: { items: SharedWithMe[]; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const waiting = items.filter((item) => item.status === "requested").length;
  return (
    <section id="shared" aria-labelledby="shared-heading" className="scroll-mt-20 flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Heading id="shared-heading" className="text-xl font-semibold tracking-tight text-foreground">
          Shared with you
        </Heading>
        {items.length > 0 && (
          <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">{items.length}</span>
        )}
      </div>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">
        Dashboards other people let you look at. You can read them, not change them.
        {waiting > 0 && ` ${waiting} waiting for their approval.`}
      </p>
      {items.length > 0 && (
        <ul aria-label="Dashboards shared with you" className="mb-5 flex flex-col gap-2">
          {items.map((shared) => (
            <li key={shared.id} className="lift flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm">
              <span className="flex min-w-0 items-center gap-3">
                <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                  {personLabel(shared.owner_name, shared.owner_email).charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 truncate font-medium text-foreground">{personLabel(shared.owner_name, shared.owner_email)}</span>
              </span>
              {shared.status === "active" ? (
                <Link href={`/dashboard/shared/${shared.id}`} className="shrink-0 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground">
                  View dashboard
                </Link>
              ) : (
                <span className="shrink-0 text-muted-foreground">Waiting for their approval</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <details className="group mt-auto rounded-xl border border-border bg-background px-4 py-3" open={items.length === 0}>
        <summary className="cursor-pointer text-sm font-medium text-foreground">Got a share link and code? Enter them here</summary>
        <div className="mt-4">
          <JoinByLink />
        </div>
      </details>
    </section>
  );
}
