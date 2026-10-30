"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { localToday } from "@/lib/dates";
import { upcomingDates, type KeyDateFromApi } from "@/lib/key-dates";

const noopSubscribe = () => () => {};

/**
 * The next dates across a person's documents, such as "Lease ends in 62 days". The days are counted in the browser
 * from the person's own date, so the count is right for them, and nothing is shown until then. Shows nothing at all
 * when no document has a clear date.
 */
export function ComingUp({
  keyDates,
  documents,
}: {
  keyDates: KeyDateFromApi[];
  documents: { id: string; filename: string }[];
}) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!mounted) return null;

  const names = new Map(documents.map((document) => [document.id, document.filename]));
  const items = upcomingDates(
    keyDates.filter((entry) => names.has(entry.document_id)),
    localToday(),
  );
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="coming-up-heading" className="rounded-2xl border border-border bg-card p-5">
      <h2 id="coming-up-heading" className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        Coming up
      </h2>
      <ul className="mt-3 flex flex-col divide-y divide-border">
        {items.map((item) => (
          <li key={`${item.documentId}-${item.text}`}>
            <Link
              href={`/dashboard/documents/${item.documentId}`}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5 outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className={item.days <= 14 && item.days >= 0 ? "font-medium text-foreground" : "text-foreground"}>
                {item.text}
              </span>
              <span className="truncate text-xs text-muted-foreground">{names.get(item.documentId)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
