import Link from "next/link";

import type { Activity } from "@/lib/dashboard";

/** What happened to the documents lately, newest first, each one opening its document when there is text to open. Nothing when there are no documents. */
export function RecentActivity({ items }: { items: Activity[] }) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="activity-heading" className="rounded-2xl border border-border bg-card p-5">
      <h2 id="activity-heading" className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        Recent activity
      </h2>
      <ul className="mt-3 flex flex-col divide-y divide-border">
        {items.map((item) => {
          const body = (
            <>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">{item.filename}</span>
                <span className="block text-xs text-muted-foreground">{item.what}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{item.when}</span>
            </>
          );
          return (
            <li key={item.id}>
              {item.openable ? (
                <Link
                  href={`/dashboard/documents/${item.id}`}
                  className="flex items-baseline justify-between gap-4 py-2.5 outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {body}
                </Link>
              ) : (
                <div className="flex items-baseline justify-between gap-4 py-2.5">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
