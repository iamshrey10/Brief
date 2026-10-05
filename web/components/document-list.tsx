import Link from "next/link";
import {
  Briefcase,
  ChevronRight,
  CircleCheck,
  CircleX,
  FileText,
  House,
  Landmark,
  LoaderCircle,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DOC_TYPE_LABELS,
  formatUploaded,
  isReadable,
  statusLabel,
  type DocumentSummary,
} from "@/lib/documents";

const TYPE_ICONS: Record<string, LucideIcon> = {
  loan: Landmark,
  lease: House,
  offer: Briefcase,
};

function StatusBadge({ status }: { status: string }) {
  const label = statusLabel(status);
  const base = "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium";

  if (status === "ready") {
    return (
      <span className={cn(base, "bg-primary/10 text-primary")}>
        <CircleCheck aria-hidden className="size-3.5" />
        {label}
      </span>
    );
  }
  if (status === "needs_retake") {
    return (
      <span
        className={cn(
          base,
          "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200",
        )}
      >
        <TriangleAlert aria-hidden className="size-3.5" />
        {label}
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className={cn(base, "bg-destructive/10 text-destructive")}>
        <CircleX aria-hidden className="size-3.5" />
        {label}
      </span>
    );
  }
  // pending, uploaded, processing: still working on it.
  return (
    <span className={cn(base, "bg-muted text-muted-foreground")}>
      <LoaderCircle aria-hidden className="size-3.5 motion-safe:animate-spin" />
      {label}
    </span>
  );
}

function DocumentRow({ doc }: { doc: DocumentSummary }) {
  const Icon = TYPE_ICONS[doc.doc_type] ?? FileText;
  const uploaded = formatUploaded(doc.created_at);
  const typeLabel = DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type;
  // Only a document that has clauses to show gets a link, anything else would open an empty page.
  const readable = isReadable(doc.status);

  const content = (
    <>
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground"
      >
        <Icon className="size-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{doc.filename}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {typeLabel}
          {uploaded && ` · Uploaded ${uploaded}`}
        </span>
      </span>
      <StatusBadge status={doc.status} />
      {readable && <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
    </>
  );

  const rowClasses = "flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3";

  return readable ? (
    <Link
      href={`/dashboard/documents/${doc.id}`}
      className={cn(
        rowClasses,
        "transition-colors outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50",
      )}
    >
      {content}
    </Link>
  ) : (
    <div className={rowClasses}>{content}</div>
  );
}

export function DocumentList({ documents }: { documents: DocumentSummary[] }) {
  if (documents.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
        <p className="text-sm font-medium text-foreground">No documents yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a loan, lease, or job offer above and Brief will explain it clause by clause.
        </p>
      </div>
    );
  }

  return (
    <section aria-label="Your documents" className="flex flex-col gap-2">
      <h2 className="font-heading text-lg font-semibold text-foreground">Your documents</h2>
      <ul className="flex flex-col gap-2">
        {documents.map((doc) => (
          <li key={doc.id}>
            <DocumentRow doc={doc} />
          </li>
        ))}
      </ul>
    </section>
  );
}
