import Link from "next/link";
import { cn } from "@/lib/utils";
import { isReadable, statusLabel, type DocumentSummary } from "@/lib/documents";

const rowClasses =
  "flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm";

export function DocumentList({ documents }: { documents: DocumentSummary[] }) {
  if (documents.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">Your documents</h2>
      {documents.map((doc) => {
        const label = (
          <span
            className={cn(
              "text-xs",
              doc.status === "ready" && "text-primary",
              doc.status === "failed" && "text-destructive",
              doc.status !== "ready" && doc.status !== "failed" && "text-muted-foreground",
            )}
          >
            {statusLabel(doc.status)}
          </span>
        );

        // Only a document that has clauses to show gets a link, anything else would open
        // an empty page.
        return isReadable(doc.status) ? (
          <Link
            key={doc.id}
            href={`/dashboard/documents/${doc.id}`}
            className={cn(rowClasses, "transition-colors hover:bg-accent")}
          >
            <span className="text-foreground">{doc.filename}</span>
            {label}
          </Link>
        ) : (
          <div key={doc.id} className={rowClasses}>
            <span className="text-foreground">{doc.filename}</span>
            {label}
          </div>
        );
      })}
    </div>
  );
}
