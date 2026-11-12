import Link from "next/link";

import type { InsightFromApi } from "@/lib/dashboard";

/** The widths of the columns, used by the headings and by every row so they line up. On a phone each row stacks. */
const COLUMNS = "sm:grid-cols-[minmax(0,1fr)_13rem_7rem_7rem] sm:gap-x-6";

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
      {/* The columns are the same width on every row, so the numbers line up under their headings. */}
      <div aria-hidden="true" className={`${COLUMNS} mt-3 hidden border-b border-border pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase sm:grid`}>
        <span>Document</span>
        <span>Key terms found</span>
        <span>Answered</span>
        <span>Open</span>
      </div>
      <ul className="mt-1 flex flex-col divide-y divide-border sm:mt-0">
        {rows.map((row) => {
          const percent = row.terms_total ? Math.round(((row.terms_found ?? 0) / row.terms_total) * 100) : 0;
          return (
            <li key={row.document_id} className={`${COLUMNS} grid grid-cols-1 gap-y-1.5 py-3 sm:items-center`}>
              <Link
                href={`/dashboard/documents/${row.document_id}`}
                className="min-w-0 truncate text-sm font-medium text-foreground outline-none max-sm:flex max-sm:min-h-11 max-sm:items-center hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {names.get(row.document_id)}
              </Link>
              {row.terms_found !== null && row.terms_total !== null ? (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span
                    role="progressbar"
                    aria-label="Key terms found"
                    aria-valuemin={0}
                    aria-valuemax={row.terms_total}
                    aria-valuenow={row.terms_found}
                    className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-muted"
                  >
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                  </span>
                  <span className="whitespace-nowrap">
                    {row.terms_found} of {row.terms_total} terms
                  </span>
                </span>
              ) : (
                <span />
              )}
              {row.questions_answered !== null ? <span className="text-sm text-muted-foreground">{row.questions_answered} answered</span> : <span />}
              {row.open_count !== null ? (
                <span className={row.open_count > 0 ? "text-sm font-medium text-foreground" : "text-sm text-muted-foreground"}>
                  {row.open_count === 0 ? "nothing open" : `${row.open_count} open`}
                </span>
              ) : (
                <span />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
