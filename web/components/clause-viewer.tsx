import { groupByPage, type ClauseData } from "@/lib/documents";

export function ClauseViewer({ clauses }: { clauses: ClauseData[] }) {
  return (
    <section aria-label="Document text" className="flex flex-col gap-6">
      {groupByPage(clauses).map(({ pageNumber, clauses: pageClauses }) => (
        <div key={pageNumber} className="flex flex-col gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Page {pageNumber}
          </h3>
          {pageClauses.map((clause) => (
            <p
              key={clause.id}
              id={`clause-${clause.id}`}
              className="rounded-lg border border-border bg-card px-4 py-3 text-sm leading-relaxed whitespace-pre-line text-card-foreground"
            >
              {clause.text}
            </p>
          ))}
        </div>
      ))}
    </section>
  );
}
