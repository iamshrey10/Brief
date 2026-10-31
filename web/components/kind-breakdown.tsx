import { countByKind } from "@/lib/document-summary";

/** How the documents divide by kind, as bars, so the mix is clear at a glance. Nothing at all for a person with no documents. */
export function KindBreakdown({ documents }: { documents: { doc_type: string }[] }) {
  const kinds = countByKind(documents);
  if (kinds.length === 0) return null;
  const most = Math.max(...kinds.map((kind) => kind.count));

  return (
    <section aria-labelledby="kinds-heading" className="rounded-2xl border border-border bg-card p-5">
      <h2 id="kinds-heading" className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        By kind
      </h2>
      <ul className="mt-4 flex flex-col gap-3">
        {kinds.map(({ kind, label, count }) => (
          <li key={kind}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-foreground">{label}</span>
              <span className="font-medium text-foreground">{count}</span>
            </div>
            <div aria-hidden="true" className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(8, Math.round((count / most) * 100))}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
