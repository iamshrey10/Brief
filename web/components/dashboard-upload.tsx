"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CloudUpload } from "lucide-react";

import { UploadPanel } from "@/components/upload-panel";
import { Button } from "@/components/ui/button";

/**
 * Where to add a document, on the Dashboard: one button and nothing else. Pressing it opens the upload form in place, and
 * Cancel puts it away. After a document is accepted the page's numbers are refreshed and one short line says so.
 */
export function DashboardUpload() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  return (
    <section aria-label="Add documents" className="rounded-2xl border border-dashed border-primary/40 bg-accent/40 p-5">
      {!open && (
        <div className="flex justify-center">
          <Button type="button" size="lg" className="h-12 gap-2 px-6 text-base" aria-expanded={false} aria-controls="dashboard-upload-form" onClick={() => setOpen(true)}>
            <CloudUpload aria-hidden="true" className="size-5" />
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
