import { AlertTriangle, CalendarDays } from "lucide-react";

import { DashboardStats } from "@/components/dashboard-stats";
import { DocTypeIcon } from "@/components/doc-type-icon";
import { LeaseCountdown } from "@/components/lease-countdown";
import { documentStats } from "@/lib/dashboard";
import { countByKind } from "@/lib/document-summary";
import { DOC_TYPE_LABELS, formatUploaded, statusLabel } from "@/lib/documents";
import { nextLeaseEnd } from "@/lib/lease-end";
import { daysAwayText, importantDates, needsAttention } from "@/lib/shared-summary";
import type { SharedDashboard } from "@/lib/sharing";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<string, string> = {
  ready: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  failed: "bg-destructive/10 text-destructive",
  needs_retake: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
};

function Heading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="font-heading text-xl font-semibold tracking-tight text-foreground">
      {children}
    </h2>
  );
}

/**
 * Someone else's dashboard, laid out so a glance answers three things: what documents there are, what the important dates
 * are, and what needs attention. Then each document on its own card with what was found in it. It is read only: there is no
 * button that changes anything and no link into their documents, which a viewer cannot open.
 */
export function SharedDashboardView({ shared, now = new Date() }: { shared: SharedDashboard; now?: Date }) {
  const lease = nextLeaseEnd(shared.key_dates, shared.documents, now);
  const dates = importantDates(shared, now);
  const attention = needsAttention(shared.documents, shared.insights);
  const kinds = countByKind(shared.documents);
  const insightFor = (id: string) => shared.insights.find((insight) => insight.document_id === id);
  const datesFor = (id: string) => dates.filter((item) => item.key.startsWith(`${id}-`));

  return (
    <div className="flex flex-col gap-10">
      <div role="note" className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/25 bg-gradient-to-br from-accent/80 via-card to-card p-5">
        <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary font-heading text-lg font-semibold text-primary-foreground">
          {shared.owner_email.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{shared.owner_email}</p>
          <p className="text-sm text-muted-foreground">shared their dashboard with you</p>
        </div>
        <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">Read only</span>
      </div>

      <DashboardStats stats={documentStats(shared.documents)} readOnly />

      {kinds.length > 0 && (
        <section aria-labelledby="shared-kinds-heading" className="flex flex-col gap-3">
          <Heading id="shared-kinds-heading">What is here</Heading>
          <ul className="flex flex-wrap gap-2">
            {kinds.map(({ kind, label, count }) => (
              <li key={kind} className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground">
                <DocTypeIcon type={kind} className="size-4 text-primary" />
                {label}
                <span className="rounded-full bg-muted px-2 text-xs font-semibold text-muted-foreground">{count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <LeaseCountdown lease={lease} linked={false} />

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="shared-dates-heading" className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <CalendarDays aria-hidden className="size-4 text-primary" />
            <h2 id="shared-dates-heading" className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Important dates
            </h2>
          </div>
          {dates.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No dates found yet.</p>
          ) : (
            <ul className="mt-3 flex flex-col divide-y divide-border">
              {dates.map((item) => {
                const away = daysAwayText(item.days);
                return (
                  <li key={item.key} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.filename}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm text-foreground">{item.value}</p>
                      {away && (
                        <p className={cn("text-xs", item.days !== null && item.days >= 0 && item.days <= 30 ? "font-medium text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>{away}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="shared-attention-heading"
          className={cn("rounded-2xl border p-5", attention.length > 0 ? "border-destructive/30 bg-destructive/5" : "border-border bg-card")}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle aria-hidden className={cn("size-4", attention.length > 0 ? "text-destructive" : "text-muted-foreground")} />
            <h2 id="shared-attention-heading" className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Needs attention
            </h2>
          </div>
          {attention.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Nothing needs attention.</p>
          ) : (
            <ul className="mt-3 flex flex-col divide-y divide-border">
              {attention.map((item) => (
                <li key={item.key} className="py-2.5">
                  <p className="text-sm font-medium text-foreground">{item.what}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.filename}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="shared-docs-heading" className="flex flex-col gap-4">
        <Heading id="shared-docs-heading">Documents</Heading>
        {shared.documents.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-4 text-center text-sm text-muted-foreground">No documents yet.</p>
        ) : (
          <ul aria-label="Shared documents" className="flex flex-col gap-4">
            {shared.documents.map((document) => {
              const insight = insightFor(document.id);
              const own = datesFor(document.id);
              return (
                <li key={document.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex items-start gap-3">
                    <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                      <DocTypeIcon type={document.doc_type} className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-heading text-lg font-semibold text-foreground">{document.filename}</h3>
                      <p className="text-sm text-muted-foreground">
                        {DOC_TYPE_LABELS[document.doc_type] ?? document.doc_type} · {formatUploaded(document.created_at, now)}
                      </p>
                    </div>
                    <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium", STATUS_TONE[document.status] ?? "bg-muted text-muted-foreground")}>
                      {statusLabel(document.status)}
                    </span>
                  </div>

                  {own.length > 0 && (
                    <ul aria-label={`Dates in ${document.filename}`} className="mt-4 flex flex-wrap gap-2">
                      {own.map((item) => (
                        <li key={item.key} className="rounded-lg bg-muted px-3 py-1.5 text-xs text-foreground">
                          <span className="text-muted-foreground">{item.label}:</span> <span className="font-medium">{item.value}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {document.key_terms.length > 0 ? (
                    <dl aria-label={`Key terms in ${document.filename}`} className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                      {document.key_terms.map((term) => (
                        <div key={term.label} className="min-w-0 border-t border-border pt-2">
                          <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{term.label}</dt>
                          <dd className="mt-0.5 text-sm text-foreground">{term.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="mt-4 text-sm text-muted-foreground">No key terms read yet.</p>
                  )}

                  {insight && insight.terms_found !== null && insight.terms_total !== null && (
                    <p className="mt-3 text-xs text-muted-foreground">{insight.terms_found} of {insight.terms_total} key terms found</p>
                  )}
                  {insight && insight.open_questions.length > 0 && (
                    <details className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                      <summary className="cursor-pointer text-xs font-medium text-foreground">Still to ask ({insight.open_questions.length})</summary>
                      <ul className="mt-2 list-disc pl-5 text-muted-foreground">
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
    </div>
  );
}
