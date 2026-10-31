import Link from "next/link";

import type { InsightFromApi } from "@/lib/dashboard";

/** What Brief has worked out about each document it has read: how many key terms it found, and how many of the usual questions the document answers. */
export function DocumentAnalysis({ insights, documents }: { insights: InsightFromApi[]; documents: { id: string; filename: string }[] }) {
  const names = new Map(documents.map((document) => [document.id, document.filename]));
  const rows = insights.filter((insight) => names.has(insight.document_id));
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="analysis-heading" className="rounded-2xl border border-border bg-card p-5">
      <h2 id="analysis-heading" className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        What Brief found
      </h2>
      <ul className="mt-3 flex flex-col divide-y divide-border">
        {rows.map((row) => {
          const percent = row.terms_total ? Math.round(((row.terms_found ?? 0) / row.terms_total) * 100) : 0;
          return (
            <li key={row.document_id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <Link
                href={`/dashboard/documents/${row.document_id}`}
                className="min-w-0 truncate text-sm font-medium text-foreground outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {names.get(row.document_id)}
              </Link>
              <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
                {row.terms_found !== null && row.terms_total !== null && (
                  <span className="flex items-center gap-2">
                    <span
                      role="progressbar"
                      aria-label="Key terms found"
                      aria-valuemin={0}
                      aria-valuemax={row.terms_total}
                      aria-valuenow={row.terms_found}
                      className="h-1.5 w-20 overflow-hidden rounded-full bg-muted"
                    >
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                    </span>
                    {row.terms_found} of {row.terms_total} terms
                  </span>
                )}
                {row.questions_answered !== null && <span>{row.questions_answered} answered</span>}
                {row.open_count !== null && (
                  <span className={row.open_count > 0 ? "font-medium text-foreground" : undefined}>
                    {row.open_count === 0 ? "nothing open" : `${row.open_count} open`}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
