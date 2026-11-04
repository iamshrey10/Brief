"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CloudUpload } from "lucide-react";

import { UploadPanel } from "@/components/upload-panel";
import { Button } from "@/components/ui/button";

/**
 * Where to add a document, on the Dashboard: an icon and one button, "Add documents", and no other words. Pressing it opens the
 * upload form in place, and Cancel puts it away. After a document is accepted the page's numbers are refreshed and one short
 * line says so.
 */
export function DashboardUpload() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  return (
    <section
      aria-label="Add documents"
      className="rounded-3xl border-2 border-dashed border-primary/40 bg-gradient-to-br from-accent via-card to-accent/60 px-6 py-10 shadow-md shadow-primary/10"
    >
      {!open && (
        <div className="flex flex-col items-center justify-center gap-6">
          <span aria-hidden="true" className="flex size-20 shrink-0 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-8 ring-primary/10">
            <CloudUpload className="size-10" />
          </span>
          <Button type="button" size="lg" className="h-14 px-10 text-lg font-semibold shadow-md shadow-primary/25" aria-expanded={false} aria-controls="dashboard-upload-form" onClick={() => setOpen(true)}>
            Add documents
          </Button>
        </div>
      )}

      {added && (
        <p role="status" className="mt-4 text-center text-sm text-foreground">
          <span className="font-medium">{added}</span> was added.{" "}
          <Link href="/dashboard/documents" className="font-medium text-primary underline underline-offset-4">
            Open Documents
          </Link>
        </p>
      )}

      {open && (
        <div id="dashboard-upload-form">
          <UploadPanel
            onUploaded={(document) => {
              setAdded(document.filename);
              setOpen(false);
              router.refresh();
            }}
          />
          <div className="mt-3 flex justify-center">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
