import { DashboardStats } from "@/components/dashboard-stats";
import { DocTypeIcon } from "@/components/doc-type-icon";
import { KindBreakdown } from "@/components/kind-breakdown";
import { LeaseCountdown } from "@/components/lease-countdown";
import { documentStats } from "@/lib/dashboard";
import { DOC_TYPE_LABELS, formatUploaded, statusLabel } from "@/lib/documents";
import { nextLeaseEnd } from "@/lib/lease-end";
import type { SharedDashboard } from "@/lib/sharing";

/**
 * Someone else's dashboard, to look at and nothing more. It has no button that changes anything and no link into their
 * documents, which a viewer cannot open, and it says at the top whose it is and that it is read only.
 */
export function SharedDashboardView({ shared, now = new Date() }: { shared: SharedDashboard; now?: Date }) {
  const lease = nextLeaseEnd(shared.key_dates, shared.documents, now);
  const insightFor = (id: string) => shared.insights.find((insight) => insight.document_id === id);

  return (
    <div className="flex flex-col gap-8">
      <p role="note" className="rounded-lg border border-primary/30 bg-accent/50 px-4 py-3 text-sm text-foreground">
        You are looking at <strong className="font-semibold">{shared.owner_email}</strong>&apos;s dashboard. It is read only: you can look, but not change anything.
      </p>

      <DashboardStats stats={documentStats(shared.documents)} readOnly />
      <LeaseCountdown lease={lease} linked={false} />

      {shared.key_dates.length > 0 && (
        <section aria-labelledby="shared-dates-heading" className="rounded-2xl border border-border bg-card p-5">
          <h2 id="shared-dates-heading" className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Dates found
          </h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {shared.key_dates.map((date) => (
              <li key={`${date.document_id}-${date.field}`} className="flex flex-wrap justify-between gap-2">
                <span className="text-foreground">
                  {date.label} <span className="text-muted-foreground">· {shared.documents.find((d) => d.id === date.document_id)?.filename}</span>
                </span>
                <span className="font-medium text-foreground">{date.value}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="shared-docs-heading" className="flex flex-col gap-3">
        <h2 id="shared-docs-heading" className="font-heading text-xl font-semibold tracking-tight text-foreground">
          Documents
        </h2>
        {shared.documents.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-4 text-center text-sm text-muted-foreground">No documents yet.</p>
        ) : (
          <ul aria-label="Shared documents" className="flex flex-col gap-2">
            {shared.documents.map((document) => {
              const insight = insightFor(document.id);
              return (
                <li key={document.id} className="rounded-lg border border-border bg-card px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <DocTypeIcon type={document.doc_type} className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{document.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {DOC_TYPE_LABELS[document.doc_type] ?? document.doc_type} · {formatUploaded(document.created_at, now)}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">{statusLabel(document.status)}</span>
                  </div>
                  {insight && insight.terms_found !== null && insight.terms_total !== null && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {insight.terms_found} of {insight.terms_total} key terms found
                      {insight.open_count ? ` · ${insight.open_count} still to ask` : ""}
                    </p>
                  )}
                  {insight && insight.open_questions.length > 0 && (
                    <details className="mt-2 text-sm">
                      <summary className="cursor-pointer text-xs font-medium text-foreground">Still to ask ({insight.open_questions.length})</summary>
                      <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                        {insight.open_questions.map((question) => (
                          <li key={question}>{question}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <KindBreakdown documents={shared.documents} />
    </div>
  );
}
