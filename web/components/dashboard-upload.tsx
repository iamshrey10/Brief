"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CloudUpload, FileText, HardDrive, ShieldCheck } from "lucide-react";

import { UploadPanel } from "@/components/upload-panel";
import { Button } from "@/components/ui/button";

/**
 * Where to add a document, on the Dashboard: a dashed drop area with a heading and one button, "Add documents", beside a short list of what is accepted. Pressing it opens the
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
      className="rounded-3xl border border-primary/25 bg-gradient-to-br from-accent via-card to-accent/60 p-4 shadow-sm"
    >
      {!open && (
        <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-[2fr_1fr]">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary/40 bg-background/60 px-6 py-6 text-center">
            <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/25 ring-4 ring-primary/10">
              <CloudUpload className="size-6" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">Add your documents</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">Upload a loan, lease, or job offer to get started.</p>
            </div>
            <Button type="button" size="lg" className="h-11 px-7 text-base font-semibold shadow-md shadow-primary/25" aria-expanded={false} aria-controls="dashboard-upload-form" onClick={() => setOpen(true)}>
              Add documents
            </Button>
          </div>
          <ul aria-label="About uploads" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-sm text-foreground">
            <li className="flex items-center gap-3">
              <FileText aria-hidden="true" className="size-4 shrink-0 text-primary" />
              PDF, JPG, PNG, or HEIC
            </li>
            <li className="flex items-center gap-3">
              <HardDrive aria-hidden="true" className="size-4 shrink-0 text-primary" />
              Up to 50 MB per file
            </li>
            <li className="flex items-center gap-3">
              <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-primary" />
              Secure and private
            </li>
          </ul>
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
