import Link from "next/link";
import { CloudUpload } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The way to add a document, on the Dashboard. The Dashboard is for looking at what Brief found, so nothing is uploaded
 * here: the one button goes to the Documents page, which is the only place to upload and manage files.
 */
export function AddDocumentsCard() {
  return (
    <section
      aria-label="Add documents"
      className="rounded-3xl border border-primary/25 bg-gradient-to-br from-accent via-card to-accent/60 p-4 shadow-sm"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-background/60 px-6 py-8 text-center">
        <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/25 ring-4 ring-primary/10">
          <CloudUpload className="size-6" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Add your documents</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Your documents, securely managed in one place.</p>
        </div>
        <Link href="/dashboard/documents" className={cn(buttonVariants({ size: "lg" }), "h-11 px-7 text-base font-semibold shadow-md shadow-primary/25")}>
          Add documents
        </Link>
      </div>
    </section>
  );
}
