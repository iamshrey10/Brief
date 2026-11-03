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
      className="rounded-2xl border border-primary/25 bg-gradient-to-br from-accent/90 via-card to-card p-6 shadow-sm"
    >
      {!open && (
        <div className="flex items-center justify-center gap-4">
          <span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/25">
            <CloudUpload className="size-7" />
          </span>
          <Button type="button" size="lg" className="h-12 px-7 text-base shadow-sm" aria-expanded={false} aria-controls="dashboard-upload-form" onClick={() => setOpen(true)}>
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
