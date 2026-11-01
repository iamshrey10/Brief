"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CloudUpload } from "lucide-react";

import { UploadPanel } from "@/components/upload-panel";
import { Button } from "@/components/ui/button";

/**
 * The first thing on the Dashboard: where to add a document. A person with no documents sees the form open, since adding one
 * is the whole point. A person who already has some sees a short bar with one button that opens it, so the way in is always
 * there without the form taking the page. After a document is accepted the page's numbers are refreshed and a line says what
 * happens next.
 */
export function DashboardUpload({ hasDocuments }: { hasDocuments: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(!hasDocuments);
  const [added, setAdded] = useState<string | null>(null);

  return (
    <section
      aria-labelledby="add-document-heading"
      className="rounded-2xl border border-primary/25 bg-gradient-to-br from-accent/80 via-card to-card p-5 shadow-sm md:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <CloudUpload className="size-6" />
          </span>
          <div>
            <h2 id="add-document-heading" className="font-heading text-xl font-semibold tracking-tight text-foreground">
              Add a document
            </h2>
            <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
              A loan, a lease or a job offer, as a PDF or a photo. Brief reads it and shows you the exact words behind every answer.
            </p>
          </div>
        </div>
        {!open && (
          <Button type="button" size="lg" aria-expanded={false} aria-controls="dashboard-upload-form" onClick={() => setOpen(true)}>
            Add a document
          </Button>
        )}
      </div>

      {added && (
        <p role="status" className="mt-4 rounded-lg border border-emerald-600/30 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 dark:bg-emerald-500/10 dark:text-emerald-100">
          <span className="font-medium">{added}</span> was added and Brief is reading it now.{" "}
          <Link href="/dashboard/documents" className="font-medium underline underline-offset-4">
            Open Documents
          </Link>{" "}
          to follow it, or add another below.
        </p>
      )}

      {open && (
        <div id="dashboard-upload-form" className="mt-5">
          <UploadPanel
            onUploaded={(document) => {
              setAdded(document.filename);
              router.refresh();
            }}
          />
        </div>
      )}
    </section>
  );
}
