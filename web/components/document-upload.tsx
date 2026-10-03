"use client";

import { useEffect, useState, type FormEvent } from "react";
import { DocumentList } from "@/components/document-list";
import { Button } from "@/components/ui/button";
import {
  DOC_TYPE_LABELS,
  isInProgress,
  MAX_POLL_DURATION_MS,
  POLL_INTERVAL_MS,
  type DocumentSummary,
} from "@/lib/documents";

const DOC_TYPES = Object.entries(DOC_TYPE_LABELS).map(([value, label]) => ({ value, label }));

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

type Status = "idle" | "uploading" | "error";

export function DocumentUpload({ initialDocuments }: { initialDocuments: DocumentSummary[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("loan");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [documents, setDocuments] = useState(initialDocuments);

  const hasInProgress = documents.some((doc) => isInProgress(doc.status));

  // A finished upload is only "processing" for a moment, so while anything is, re-check the
  // list and let it flip to ready by itself. Depends on the boolean and the count, not the
  // list itself, so a fresh list from each check doesn't restart the timer, but a new upload
  // does.
  useEffect(() => {
    if (!hasInProgress) return;

    const startedAt = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - startedAt >= MAX_POLL_DURATION_MS) {
        clearInterval(timer);
        return;
      }
      try {
        const res = await fetch("/api/backend/documents");
        if (res.ok) setDocuments(await res.json());
      } catch {
        // Network blip, the next tick tries again.
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [hasInProgress, documents.length]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setStatus("error");
      setErrorMessage("That file is larger than the 50MB limit.");
      return;
    }

    setStatus("uploading");
    setErrorMessage("");

    try {
      const createRes = await fetch("/api/backend/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          doc_type: docType,
          content_type: file.type || "application/pdf",
          file_size_bytes: file.size,
        }),
      });
      if (!createRes.ok) throw new Error("could not start the upload");
      const { document_id, upload_url } = await createRes.json();

      const uploadRes = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/pdf" },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("the file upload failed");

      const confirmRes = await fetch(`/api/backend/documents/${document_id}/confirm`, {
        method: "PATCH",
      });
      if (!confirmRes.ok) throw new Error("could not confirm the upload");
      const confirmed: DocumentSummary = await confirmRes.json();

      setDocuments((prev) => [confirmed, ...prev]);
      setFile(null);
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "something went wrong");
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
        <label className="text-sm font-medium text-foreground">
          Document
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/heic"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
          />
        </label>

        <label className="text-sm font-medium text-foreground">
          Type
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {DOC_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <Button type="submit" disabled={!file || status === "uploading"}>
          {status === "uploading" ? "Uploading..." : "Upload"}
        </Button>

        {status === "error" && <p className="text-sm text-destructive">{errorMessage}</p>}
      </form>

      <DocumentList documents={documents} />
    </div>
  );
}
