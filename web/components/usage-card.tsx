import { usageRows, type Usage } from "@/lib/usage";

/** Today's daily limits as one bar each. `usage` is null when the numbers could not be had, and the card says so instead of guessing. */
export function UsageCard({ usage }: { usage: Usage | null }) {
  return (
    <section aria-labelledby="usage-heading" className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="usage-heading" className="text-lg font-semibold tracking-tight text-foreground">
          Today&apos;s limits
        </h2>
        <p className="text-xs text-muted-foreground">Resets at midnight UTC</p>
      </div>

      {usage === null ? (
        <p className="mt-4 text-sm text-muted-foreground">Your usage is not available right now. Try again in a moment.</p>
      ) : (
        <ul className="mt-5 flex flex-col gap-5">
          {usageRows(usage).map((row) => (
            <li key={row.kind}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium text-foreground">{row.label}</span>
                <span className="text-muted-foreground">
                  {row.used} of {row.limit} used
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={`${row.label} used today`}
                aria-valuemin={0}
                aria-valuemax={row.limit}
                aria-valuenow={Math.min(row.used, row.limit)}
                className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className={row.left === 0 ? "h-full rounded-full bg-destructive" : "h-full rounded-full bg-primary"}
                  style={{ width: `${row.percent}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {row.left === 0 ? "None left today" : `${row.left} left today`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
